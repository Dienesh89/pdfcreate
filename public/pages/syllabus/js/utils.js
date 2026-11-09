/* =========================================================
   utils.js – small helpers and shared UI pieces
   ========================================================= */

// Waits for the given number of milliseconds: `await sleep(500)`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// SweetAlert2 preset (button colour + dark-mode friendly popup)
const prefersDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
const Alert = Swal.mixin({
  confirmButtonColor: "#d9480f",
  ...(prefersDarkMode ? { background: "#2a1f17", color: "#fff3dc" } : {})
});
