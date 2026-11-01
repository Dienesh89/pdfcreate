/* =========================================================
   utils.js – small helpers and shared UI pieces
   ========================================================= */

// Waits for the given number of milliseconds: `await sleep(500)`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// SweetAlert2 preset (button colour + dark-mode friendly popup)
const prefersDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
const Alert = Swal.mixin({
  confirmButtonColor: "#4f46e5",
  ...(prefersDarkMode ? { background: "#181b30", color: "#eceefb" } : {})
});
