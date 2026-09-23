// Display settings: colour scheme, larger text, high contrast. Saved in this
// browser only (localStorage), never sent anywhere.
export const DISPLAY_KEYS = { theme: "hub-theme", large: "hub-large", contrast: "hub-contrast" } as const;

// Runs in <head> before the page draws, so there's no flash of the wrong theme.
export const DISPLAY_SCRIPT = `(function(){try{var d=document.documentElement,s=localStorage,t=s.getItem("${DISPLAY_KEYS.theme}");
if(t==="light"||t==="dark")d.setAttribute("data-theme",t);
if(s.getItem("${DISPLAY_KEYS.large}")==="1")d.classList.add("large");
if(s.getItem("${DISPLAY_KEYS.contrast}")==="1")d.classList.add("contrast");}catch(e){}})();`;
