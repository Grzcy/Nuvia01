// Global ADMIN UID centralized
(function(){
  try {
    // Only set if not already provided by environment or another script
    if (!window.ADMIN_UID) {
      window.ADMIN_UID = 'RJZ8xhsjEsdKBGFYveWO0Rsq1Zz1';
    }
  } catch (e) { console.warn('admin-uid init failed', e); }
})();
