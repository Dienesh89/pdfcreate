const siteAuthButton = document.getElementById("puterAuthButton");
let siteAuthBusy = false;

async function refreshSiteAuthButton() {
  if (!siteAuthButton) return;

  if (typeof puter === "undefined" || !puter?.auth) {
    siteAuthButton.textContent = "Sign in with Puter";
    siteAuthButton.setAttribute("aria-label", "Sign in with Puter");
    return;
  }

  try {
    const signedIn = await puter.auth.isSignedIn();
    siteAuthButton.textContent = signedIn ? "Sign out" : "Sign in with Puter";
    siteAuthButton.setAttribute("aria-label", signedIn ? "Sign out" : "Sign in with Puter");
  } catch (error) {
    console.error("Could not check Puter sign-in status:", error);
    siteAuthButton.textContent = "Sign in with Puter";
    siteAuthButton.setAttribute("aria-label", "Sign in with Puter");
  }
}

siteAuthButton?.addEventListener("click", async () => {
  if (siteAuthBusy) return;
  siteAuthBusy = true;
  siteAuthButton.disabled = true;

  try {
    if (typeof puter === "undefined" || !puter?.auth) {
      throw new Error("Puter.js could not be loaded. Check your internet connection and reload the page.");
    }

    if (await puter.auth.isSignedIn()) {
      await puter.auth.signOut();
    } else {
      await puter.auth.signIn();
    }
    await refreshSiteAuthButton();
  } catch (error) {
    console.error("Puter authentication failed:", error);
    await window.Swal.fire({
      icon: "error",
      title: "Puter sign-in failed",
      text: error.message || "Please try again."
    });
  } finally {
    siteAuthBusy = false;
    siteAuthButton.disabled = false;
  }
});

refreshSiteAuthButton();
