import argparse
import datetime
import json
import socket
import sys
import re
import os

import nmap
import requests
import wmi
from scapy.all import ARP, Ether, srp

# -------- Config (env-overridable) --------
API_ROOT_DEFAULT = os.environ.get("API_ROOT_DEFAULT", "http://10.27.16.97:4000")
TARGET_DEFAULT = os.environ.get("TARGET_DEFAULT", "10.27.16.0/24")
WMI_USERNAME = os.environ.get("WMI_USERNAME", "os-admin")
WMI_PASSWORD = os.environ.get("WMI_PASSWORD", "Bahrain@2024")
REQ_TIMEOUT = int(os.environ.get("REQ_TIMEOUT", "8"))

# Per-scan ID cache so previewed devices get sequential IDs even before DB insert
_id_state = {}  # {assetType: {"prefix": str, "num": int}}


def log(line: str):
    print(line, file=sys.stderr, flush=True)


def parse_args():
    p = argparse.ArgumentParser(description="Asset auto-discovery and uploader")
    p.add_argument("--target", default=TARGET_DEFAULT, help="IP, range (a-b), or CIDR (e.g., 10.27.16.0/24)")
    p.add_argument("--api-url", default=API_ROOT_DEFAULT, help="API root (no trailing slash), e.g., http://host:4000")
    p.add_argument("--dry-run", action="store_true", help="Do not POST; just output discovered assets")
    p.add_argument("--json", action="store_true", help="When dry-run, print JSON list to stdout")
    return p.parse_args()


def get_mac_address(ip):
    """Try ARP to get MAC; fall back to 'Unknown' if not available/allowed."""
    try:
        arp = ARP(pdst=ip)
        ether = Ether(dst="ff:ff:ff:ff:ff:ff")
        result = srp(ether / arp, timeout=2, verbose=False)[0]
        if result:
            return result[0][1].hwsrc
    except Exception:
        pass
    return "Unknown"


def scan_device(ip):
    log(f"Scanning: {ip}")
    data = {
        "ip": ip, "hostname": "Unknown", "os": "Unknown", "cpu": "Unknown",
        "ram": "Unknown", "storage": "Unknown", "free_storage": "Unknown",
        "bios_version": "Unknown", "domain_workgroup": "Unknown",
        "logged_in_user": "Unknown", "uptime": "Unknown",
        "mac": "Unknown", "manufacturer": "Unknown", "model": "Unknown",
        "serial_number": "Unknown", "ports": [],
    }

    # Reverse DNS
    try:
        data["hostname"] = socket.gethostbyaddr(ip)[0]
    except Exception:
        pass

    # Fast TCP scan (no OS detection to avoid privilege/latency issues)
    try:
        nm = nmap.PortScanner()
        nm.scan(ip, arguments="-T4 -F")
        if ip in nm.all_hosts():
            if "tcp" in nm[ip]:
                data["ports"] = [
                    f"{p} ({nm[ip]['tcp'][p]['name']})"
                    for p in nm[ip]["tcp"]
                    if nm[ip]["tcp"][p]["state"] == "open"
                ]
            mac_guess = (nm[ip].get("addresses") or {}).get("mac")
            if mac_guess:
                data["mac"] = mac_guess
    except Exception as e:
        log(f"Nmap error {ip}: {e}")

    # ARP fallback (may need admin/Npcap; safe to fail)
    if data["mac"] == "Unknown":
        data["mac"] = get_mac_address(ip)

    # WMI (local or remote)
    try:
        local_ips = socket.gethostbyname_ex(socket.gethostname())[2]
        is_local = ip in local_ips or ip == "localhost"
        conn = wmi.WMI() if is_local else wmi.WMI(computer=ip, user=WMI_USERNAME, password=WMI_PASSWORD)

        os_info = conn.Win32_OperatingSystem()[0]
        cs_info = conn.Win32_ComputerSystem()[0]
        bios_info = conn.Win32_BIOS()[0]
        cpu_info = conn.Win32_Processor()[0]
        product_info = conn.Win32_ComputerSystemProduct()[0]

        total_storage = sum(int(d.Size) for d in conn.Win32_LogicalDisk(DriveType=3))
        free_storage = sum(int(d.FreeSpace) for d in conn.Win32_LogicalDisk(DriveType=3))
        last_boot = datetime.datetime.strptime(os_info.LastBootUpTime.split('.')[0], '%Y%m%d%H%M%S')
        uptime = datetime.datetime.now() - last_boot

        data.update({
            "os": f"{os_info.Caption} {os_info.Version}",
            "cpu": cpu_info.Name,
            "ram": str(round(int(cs_info.TotalPhysicalMemory) / (1024 ** 3))),
            "storage": str(round(total_storage / (1024 ** 3))),
            "free_storage": str(round(free_storage / (1024 ** 3))),
            "bios_version": getattr(bios_info, "SMBIOSBIOSVersion", "Unknown"),
            "domain_workgroup": cs_info.Domain,
            "logged_in_user": cs_info.UserName,
            "uptime": str(uptime).split('.')[0],
            "manufacturer": getattr(cs_info, "Manufacturer", "Unknown"),
            "model": getattr(product_info, "Name", "Unknown"),
            "serial_number": getattr(product_info, "IdentifyingNumber", "Unknown"),
        })
    except Exception as e:
        log(f"WMI error {ip}: {e}")

    return data


def auto_detect_group_and_type(os_name, model):
    os_name = (os_name or "").lower()
    model = (model or "").lower()
    if "windows" in os_name:
        return "Windows", "PC"
    if any(k in os_name for k in ["linux", "ubuntu", "debian", "centos", "rhel"]):
        return "Servers & Infra", "Server"
    if any(k in os_name for k in ["ios", "android"]):
        return "Mobile Device", "Mobile Phones"
    if any(k in model for k in ["vmware", "hyper-v"]):
        return "Servers & Infra", "Server"
    return "Windows", "PC"


def get_next_asset_id(api_root, asset_type):
    try:
        encoded_type = requests.utils.quote(asset_type)
        url = f"{api_root}/assets/next-id/{encoded_type}"
        res = requests.get(url, timeout=REQ_TIMEOUT)
        if res.status_code == 200:
            return res.json().get("id", "UNK-001")
        else:
            log(f"Next-ID failed {asset_type}: {res.status_code}")
    except Exception as e:
        log(f"Next-ID error: {e}")
    return "UNK-001"


def _propose_id(api_root, asset_type):
    """
    Propose a unique ID per scan session by caching the first DB-assigned ID
    per assetType and incrementing locally for subsequent items of same type.
    """
    key = (asset_type or "GEN").upper()
    st = _id_state.get(key)
    if not st:
        base = get_next_asset_id(api_root, key)  # e.g., PC-004
        m = re.match(r"^([A-Z0-9]+)-(\d+)$", base or "")
        if m:
            prefix, num = m.group(1), int(m.group(2))
        else:
            prefix, num = (key[:3] or "GEN"), 1
        st = {"prefix": prefix, "num": num}
        _id_state[key] = st
        return f"{prefix}-{str(num).zfill(3)}"
    else:
        st["num"] += 1
        return f"{st['prefix']}-{str(st['num']).zfill(3)}"


def load_existing(api_root):
    macs, ips = set(), set()
    try:
        res = requests.get(f"{api_root}/assets", timeout=REQ_TIMEOUT)
        if res.status_code == 200:
            for a in res.json():
                m = (a or {}).get("macAddress")
                i = (a or {}).get("ipAddress")
                if m:
                    macs.add(m)
                if i:
                    ips.add(i)
    except Exception as e:
        log(f"Load-existing error: {e}")
    return macs, ips


def is_duplicate(macs_set, ips_set, mac, ip):
    return (mac and mac in macs_set) or (ip and ip in ips_set)


def format_for_upload(api_root, info):
    group, assetType = auto_detect_group_and_type(info.get("os", ""), info.get("model", ""))
    asset_id = _propose_id(api_root, assetType)  # <-- local sequential IDs per scan
    return {
        "assetId": asset_id,
        "group": group,
        "assetType": assetType,
        "brandModel": f"{info.get('manufacturer')} {info.get('model')}".strip(),
        "serialNumber": info.get("serial_number"),
        "assignedTo": info.get("logged_in_user"),
        "ipAddress": info.get("ip"),
        "macAddress": info.get("mac"),
        "osFirmware": info.get("os"),
        "cpu": info.get("cpu"),
        "ram": info.get("ram"),
        "storage": info.get("storage"),
        "portDetails": ", ".join(info.get("ports") or []),
        "powerConsumption": "",
        "purchaseDate": "",
        "warrantyExpiry": "",
        "eol": "",
        "maintenanceExpiry": "",
        "cost": "",
        "depreciation": "",
        "residualValue": "",
        "status": "",
        "condition": "",
        "usagePurpose": "",
        "accessLevel": "",
        "licenseKey": "",
        "complianceStatus": "",
        "documentation": "",
        "remarks": "",
        "lastAuditDate": "",
        "disposedDate": "",
        "replacementPlan": ""
    }


def discover_hosts(target_str):
    """Safe discovery that avoids ARP/privileged probes to prevent truncated XML on Windows services."""
    log(f"Start scan: {target_str}")
    nm = nmap.PortScanner()
    try:
        # No ARP, no reverse DNS, conservative retries and per-host timeout
        nm.scan(hosts=target_str, arguments="-sn -n --disable-arp-ping --max-retries 1 --host-timeout 2s")
        up = [h for h in nm.all_hosts() if nm[h].state() == "up"]
        log(f"Hosts up: {len(up)}")
        return up
    except Exception as e:
        log(f"nmap discovery failed: {e}")
        return []


def main():
    args = parse_args()
    api_root = args.api_url.rstrip("/")
    assets_url = f"{api_root}/assets"
    target = args.target

    discovered_payloads = []
    macs_set, ips_set = load_existing(api_root)
    seen = 0
    added = 0
    skipped = 0

    for ip in discover_hosts(target):
        seen += 1
        try:
            info = scan_device(ip)
            mac = info.get("mac")
            ipaddr = info.get("ip")

            if is_duplicate(macs_set, ips_set, mac, ipaddr):
                skipped += 1
                log(f"Duplicate: {ip} (skipped)")
                continue

            payload = format_for_upload(api_root, info)

            if args.dry_run:
                discovered_payloads.append(payload)
                log(f"Prepared: {ip} → {payload['assetId']}")
            else:
                res = requests.post(assets_url, json=payload, timeout=REQ_TIMEOUT)
                if res.status_code in (200, 201):
                    added += 1
                    if payload.get("macAddress"):
                        macs_set.add(payload["macAddress"])
                    if payload.get("ipAddress"):
                        ips_set.add(payload["ipAddress"])
                    log(f"Registered: {ip} → {payload['assetId']}")
                else:
                    log(f"POST failed {ip}: {res.status_code} {res.text}")

        except Exception as e:
            log(f"Error {ip}: {e}")

    log(f"Done. Seen: {seen}, Prepared/Added: {added if args.dry_run else added}, Skipped: {skipped}")

    if args.dry_run and args.json:
        print(json.dumps(discovered_payloads, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
