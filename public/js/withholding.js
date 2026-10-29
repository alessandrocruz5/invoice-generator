// Expanded withholding tax presets (spec §5). Pure data and lookups.
export const WITHHOLDING_PRESETS = [
  { id: 'prof-ind-5', rate: '5', label: 'Professional fee, individual, gross ≤ ₱3M, with sworn declaration (5%)' },
  { id: 'prof-ind-10', rate: '10', label: 'Professional fee, individual, gross > ₱3M or no sworn declaration (10%)' },
  { id: 'prof-corp-10', rate: '10', label: 'Professional fee, corporation, ≤ ₱720K (10%)' },
  { id: 'prof-corp-15', rate: '15', label: 'Professional fee, corporation, above ₱720K (15%)' },
  { id: 'contractor-2', rate: '2', label: 'Contractor; services to top withholding agents (2%)' },
  { id: 'goods-1', rate: '1', label: 'Goods to top withholding agents (1%)' },
  { id: 'rent-5', rate: '5', label: 'Rent (5%)' },
];

export const CUSTOM_PRESET = 'custom';

export function presetById(id) {
  return WITHHOLDING_PRESETS.find((p) => p.id === id) ?? null;
}

export function helperText(presetId) {
  return presetId === 'prof-ind-5'
    ? "5% applies only if you've given this client a sworn declaration. Without one, they'll withhold 10%."
    : null;
}
