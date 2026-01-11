// Debug script - paste this in browser console to test toast system
console.log('Testing toast system...');
console.log('Toast container:', document.getElementById('mapToastContainer'));
console.log('Dismissed toasts:', localStorage.getItem('iftalk_map_toasts_dismissed'));
console.log('First use flag:', localStorage.getItem('iftalk_map_first_use_shown'));

// Clear toast flags to see them again
localStorage.removeItem('iftalk_map_toasts_dismissed');
localStorage.removeItem('iftalk_map_first_use_shown');
console.log('Toast flags cleared - refresh and open map to see toasts again');
