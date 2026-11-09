/* =========================================================
   dom.js – references to the HTML elements used by the app
   ========================================================= */

// Image picker
const fileInput = document.getElementById("fileInput");     // hidden <input type="file">
const dropzone = document.getElementById("dropzone");       // dashed upload area
const imageListElement = document.getElementById("fileList"); // <ul> that shows selected images
const convertButton = document.getElementById("convertBtn");  // "Convert to PDF" button

// Added for the shared file-list look (see ../../css/file-list.css)
const emptyMessageElement = document.getElementById("emptyMsg");
const listPanelElement = document.getElementById("listPanel");
const actionBarElement = document.getElementById("actionBar");
const summaryElement = document.getElementById("summary");
const clearButton = document.getElementById("clearBtn");
