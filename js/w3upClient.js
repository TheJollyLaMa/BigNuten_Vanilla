// js/w3upClient.js

// Lazily access window.w3up so the module does not throw when the IPFS
// browser bundle hasn't loaded yet (e.g. during local dev or when blocked).
function getCreate() {
  return window.w3up && window.w3up.create;
}

// Attempt to restore an existing W3UP session without prompting the user.
// Returns { client, spaceDid } if a previously-authorized space is found, otherwise null.
export async function tryAutoRestoreW3upClient() {
  const create = getCreate();
  if (!create) {
    console.warn("W3UP auto-restore: window.w3up not available.");
    return null;
  }
  try {
    const client = await create();
    const spaces = client.spaces();
    if (!spaces.length) {
      console.log("W3UP auto-restore: no existing spaces found.");
      return null;
    }
    const space = spaces[0];
    await client.setCurrentSpace(space.did());
    console.log("W3UP auto-restored space:", space.did());
    return { client, spaceDid: space.did() };
  } catch (err) {
    console.warn("W3UP auto-restore failed:", err);
    return null;
  }
}

export async function connectW3upClient() {
  const create = getCreate();
  if (!create) {
    console.error("connectW3upClient: window.w3up is not available. Ensure the IPFS browser bundle loaded.");
    return null;
  }

  // Try to restore an existing session before prompting the user.
  const restored = await tryAutoRestoreW3upClient();
  if (restored) return restored;

  try {
    console.log("Initializing w3up client...");
    const client = await create();
    console.log("Client ready:", client);

    const email = prompt("Enter your email to login:");
    if (!email) {
      alert("Please enter a valid email to login.");
      return null;
    }

    const account = await client.login(email);
    console.log("Login successful:", account);
    if (account.plan) {
      await account.plan.wait();
      console.log("Payment plan confirmed.");
    }

    const spaces = client.spaces();
    if (!spaces.length) {
      console.warn("No spaces found.");
      return null;
    }

    const space = spaces[0];
    await client.setCurrentSpace(space.did());
    console.log("Connected to space:", space.did());

    // Reveal the IPFS icon
    const ipfsIcon = document.getElementById("ipfsIcon");
    if (ipfsIcon) ipfsIcon.style.display = "inline-block";

    return {
      client,
      spaceDid: space.did(),
    };
  } catch (err) {
    console.error("Error initializing w3up client:", err);
    return null;
  }
}