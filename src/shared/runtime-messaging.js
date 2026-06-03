(function attachNuanRuntimeMessaging(root) {
  const NO_RESPONSE_ERROR = "Extension background did not respond. Reload the unpacked extension from chrome://extensions.";

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      if (!root.chrome?.runtime?.sendMessage) {
        reject(new Error("Extension runtime messaging is unavailable."));
        return;
      }

      try {
        root.chrome.runtime.sendMessage(message, (response) => {
          const runtimeError = root.chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || NO_RESPONSE_ERROR));
            return;
          }

          if (typeof response === "undefined") {
            reject(new Error(NO_RESPONSE_ERROR));
            return;
          }

          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  root.NuanRuntime = { sendMessage };
})(typeof globalThis !== "undefined" ? globalThis : window);
