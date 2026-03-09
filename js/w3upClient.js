// js/w3upClient.js

const { create } = window.w3up;

export async function connectW3upClient() {
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