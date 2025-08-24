export function fmtBD(value) {
  const num = Number(value || 0);
  return `BD ${new Intl.NumberFormat('en-BH', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }).format(num)}`;
}
