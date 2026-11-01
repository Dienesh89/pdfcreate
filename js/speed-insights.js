/**
 * Vercel Speed Insights initialization
 * 
 * This module initializes Vercel Speed Insights for tracking page performance metrics.
 * It uses the Web Vitals API to capture Core Web Vitals and send them to Vercel's analytics.
 */

// Initialize Speed Insights using the script injection method for vanilla JS
(function() {
  'use strict';
  
  // Speed Insights queue initialization
  window.si = window.si || function () { 
    (window.siq = window.siq || []).push(arguments); 
  };
  
  // Load the Speed Insights script
  const script = document.createElement('script');
  script.src = '/_vercel/speed-insights/script.js';
  script.defer = true;
  
  // Append to document head
  if (document.head) {
    document.head.appendChild(script);
  } else {
    // Fallback: wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
      document.head.appendChild(script);
    });
  }
})();
