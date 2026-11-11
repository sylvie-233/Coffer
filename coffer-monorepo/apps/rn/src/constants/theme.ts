/** 与移动端原型一致的视觉变量。 */
export const colors = {
  ink: '#1E1C19',
  ink2: '#56524A',
  muted: '#948E82',
  faint: '#B6AFA2',
  line: '#E3DFD4',
  lineSoft: '#EDEAE1',
  accent: '#125B4A',
  accentPressed: '#0E4E3F',
  accentSoft: '#E3EFEA',
  brass: '#AE8850',
  bg: '#FBF9F3',
  surface: '#FFFFFF',
  field: '#F4F2EB',
  fieldBorder: '#E3DFD4',
  danger: '#A84A55',
  dangerSoft: '#FBEFF0',
  success: '#2F8C63',
  warning: '#C9752F',
  overlay: 'rgba(20, 18, 15, 0.42)',
} as const;

export const radii = {
  sm: 8,
  md: 11,
  lg: 12,
  xl: 16,
  sheet: 20,
} as const;

export const spacing = {
  page: 18,
  card: 12,
  gap: 10,
} as const;
