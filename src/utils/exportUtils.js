// src/utils/exportUtils.js
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// Sanitize Excel sheet names: remove invalid chars and cap at 31 chars
const safeSheetName = (name) => {
  const base = (name || 'Sheet').toString().trim() || 'Sheet';
  return base.replace(/[:\\/?*\[\]]/g, ' ').slice(0, 31);
};

export function exportToExcel(data, fileName = 'assets.xlsx') {
  const sheet = XLSX.utils.json_to_sheet(data || []);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, safeSheetName('All Assets'));
  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buffer]), fileName);
}

export function exportToExcelByGroup(data, fileName = 'grouped_assets.xlsx') {
  const rows = Array.isArray(data) ? data : [];
  const book = XLSX.utils.book_new();

  // Unique, truthy groups
  const groups = [...new Set(rows.map(a => a.group).filter(Boolean))];

  // Add grouped sheets
  groups.forEach((group) => {
    const filtered = rows.filter(a => a.group === group);
    const sheet = XLSX.utils.json_to_sheet(filtered);
    XLSX.utils.book_append_sheet(book, sheet, safeSheetName(group));
  });

  // Add ungrouped sheet if any
  const ungrouped = rows.filter(a => !a.group);
  if (ungrouped.length > 0) {
    const sheet = XLSX.utils.json_to_sheet(ungrouped);
    XLSX.utils.book_append_sheet(book, sheet, safeSheetName('Ungrouped'));
  }

  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buffer]), fileName);
}

export function exportGroupOnly(data, group, fileName = 'group_assets.xlsx') {
  const rows = Array.isArray(data) ? data : [];
  const filtered = rows.filter(a => a.group === group);
  exportToExcel(filtered, fileName);
}
