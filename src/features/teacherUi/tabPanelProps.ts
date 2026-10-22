/* props לפאנל התוכן של טאב: מקשר אותו לטאב לקוראי מסך (id של הפאנל = `${idPrefix}-panel-${id}`, כפי ש-TabBar מצפה) */
export function tabPanelProps(idPrefix: string, id: string): { id: string; role: 'tabpanel'; 'aria-labelledby': string; tabIndex: 0 } {
  return { id: `${idPrefix}-panel-${id}`, role: 'tabpanel', 'aria-labelledby': `${idPrefix}-tab-${id}`, tabIndex: 0 }
}
