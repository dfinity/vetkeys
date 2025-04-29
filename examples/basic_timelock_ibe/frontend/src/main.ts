import "./style.css";
import { createActor } from "../../src/declarations/basic_timelock_ibe";
import { Principal } from "@dfinity/principal";
import {
  DerivedPublicKey,
  IdentityBasedEncryptionCiphertext,
} from "ic_vetkeys";
import { _SERVICE } from "../../src/declarations/basic_timelock_ibe/basic_timelock_ibe.did";
import { AuthClient } from "@dfinity/auth-client";
import type { ActorSubclass } from "@dfinity/agent";

let ibePublicKey: DerivedPublicKey | undefined = undefined;
let myPrincipal: Principal | undefined = undefined;
let authClient: AuthClient | undefined;
let basicTimelockIbeCanister: ActorSubclass<_SERVICE> | undefined;

function getBasicTimelockIbeCanister(): ActorSubclass<_SERVICE> {
  if (basicTimelockIbeCanister) return basicTimelockIbeCanister;
  if (!process.env.CANISTER_ID_BASIC_TIMELOCK_IBE) {
    throw Error("CANISTER_ID_BASIC_TIMELOCK_IBE is not set");
  }
  if (!authClient) {
    throw Error("Auth client is not initialized");
  }
  const host =
    process.env.DFX_NETWORK === "ic"
      ? `https://${process.env.CANISTER_ID_BASIC_TIMELOCK_IBE}.ic0.app`
      : "http://localhost:8000";

  basicTimelockIbeCanister = createActor(
    process.env.CANISTER_ID_BASIC_TIMELOCK_IBE,
    process.env.DFX_NETWORK === "ic"
      ? undefined
      : {
          agentOptions: {
            identity: authClient.getIdentity(),
            host,
          },
        }
  );

  return basicTimelockIbeCanister;
}

// Get the root IBE public key
async function getRootIbePublicKey(): Promise<DerivedPublicKey> {
  if (ibePublicKey) return ibePublicKey;
  ibePublicKey = DerivedPublicKey.deserialize(
    new Uint8Array(
      await getBasicTimelockIbeCanister().get_root_ibe_public_key()
    )
  );
  return ibePublicKey;
}

export function login(client: AuthClient) {
  client.login({
    maxTimeToLive: BigInt(1800) * BigInt(1_000_000_000),
    identityProvider:
      process.env.DFX_NETWORK === "ic"
        ? "https://identity.ic0.app/#authorize"
        : `http://${process.env.CANISTER_ID_INTERNET_IDENTITY}.localhost:8000/#authorize`,
    onSuccess: async () => {
      myPrincipal = client.getIdentity().getPrincipal();
      updateUI(true);
    },
    onError: (error) => {
      alert("Authentication failed: " + error);
    },
  });
}

export function logout() {
  authClient?.logout();
  const messagesDiv = document.getElementById("messages")!;
  messagesDiv.innerHTML = "";
  myPrincipal = undefined;
  updateUI(false);
}

async function initAuth() {
  authClient = await AuthClient.create();
  const isAuthenticated = await authClient.isAuthenticated();

  if (isAuthenticated) {
    myPrincipal = authClient.getIdentity().getPrincipal();
    updateUI(true);
  } else {
    updateUI(false);
  }
}

function updateUI(isAuthenticated: boolean) {
  const loginButton = document.getElementById("loginButton")!;
  const principalDisplay = document.getElementById("principalDisplay")!;
  const logoutButton = document.getElementById("logoutButton")!;
  const lotActions = document.getElementById("lotActions")!;
  const lotForm = document.getElementById("lotForm")!;
  const lotsList = document.getElementById("lotsList")!;

  loginButton.style.display = isAuthenticated ? "none" : "block";
  principalDisplay.style.display = isAuthenticated ? "block" : "none";
  logoutButton.style.display = isAuthenticated ? "block" : "none";
  lotActions.style.display = isAuthenticated ? "block" : "none";
  lotForm.style.display = "none";
  lotsList.style.display = "none";

  if (isAuthenticated && myPrincipal) {
    principalDisplay.textContent = `Principal: ${myPrincipal.toString()}`;
  }
}

async function handleLogin() {
  if (!authClient) {
    alert("Auth client not initialized");
    return;
  }

  login(authClient);
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <h1>Basic Timelock IBE Secret Bid Auction using VetKeys</h1>
    <div class="principal-container">
      <div id="principalDisplay" class="principal-display"></div>
      <button id="logoutButton" style="display: none;">Logout</button>
    </div>
    <div id="lotActions" style="display: none;">
      <button id="createLotButton">Create New Lot</button>
      <button id="listLotsButton">List Lots</button>
    </div>
    <div id="lotForm" style="display: none;">
      <h3>Create New Lot</h3>
      <form id="createLotForm">
        <div>
          <label for="lotName">Name:</label>
          <input type="text" id="lotName" required>
        </div>
        <div>
          <label for="lotDescription">Description:</label>
          <textarea id="lotDescription" required></textarea>
        </div>
        <div>
          <label for="lotDuration">Duration (seconds):</label>
          <input type="number" id="lotDuration" min="1" required>
        </div>
        <button type="submit">Submit</button>
      </form>
    </div>
    <div id="lotsList" style="display: none;">
      <h3>Lots</h3>
      <div id="openLots"></div>
      <div id="closedLots"></div>
    </div>
    <button id="loginButton">Login</button>
  </div>
`;

// Add event listeners
document.getElementById("loginButton")!.addEventListener("click", handleLogin);
document.getElementById("logoutButton")!.addEventListener("click", logout);
document.getElementById("createLotButton")!.addEventListener("click", () => {
  document.getElementById("lotForm")!.style.display = "block";
  document.getElementById("lotsList")!.style.display = "none";
});
document.getElementById("listLotsButton")!.addEventListener("click", listLots);
document
  .getElementById("createLotForm")!
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (document.getElementById("lotName") as HTMLInputElement).value;
    const description = (
      document.getElementById("lotDescription") as HTMLTextAreaElement
    ).value;
    const duration = parseInt(
      (document.getElementById("lotDuration") as HTMLInputElement).value
    );
    await createLot(name, description, duration);
  });

async function createLot(
  name: string,
  description: string,
  durationSeconds: number
) {
  try {
    const result = await getBasicTimelockIbeCanister().create_lot(
      name,
      description,
      durationSeconds
    );
    alert(`Lot created successfully with ID: ${result}`);
    document.getElementById("lotForm")!.style.display = "none";
  } catch (error) {
    alert(`Failed to create lot: ${error}`);
  }
}

async function listLots() {
  try {
    const [openLots, closedLots] =
      await getBasicTimelockIbeCanister().get_lots();
    const openLotsDiv = document.getElementById("openLots")!;
    const closedLotsDiv = document.getElementById("closedLots")!;

    openLotsDiv.innerHTML = "<h4>Open Lots</h4>";
    closedLotsDiv.innerHTML = "<h4>Closed Lots</h4>";

    if (openLots.lots.length === 0) {
      openLotsDiv.innerHTML += "<p>No open lots</p>";
    } else {
      openLots.lots.forEach((lot, index) => {
        const bidFormId = `bidForm-${lot.id}`;
        openLotsDiv.innerHTML += `
          <div class="lot">
            <h5>Name: ${lot.name}</h5>
            <p>Description: ${lot.description}</p>
            <p>Ends at: ${new Date(Number(lot.end_time) / 1000000).toLocaleString()}</p>
            <p>Have I bid: ${openLots.bidders[index].find((bidder) => bidder.compareTo(myPrincipal as Principal) === "eq") ? "Yes" : "No"}</p>
            <p>Bidders:${openLots.bidders[index].length === 0 ? " no bidders yet" : openLots.bidders[index].map((bidder) => "<br>" + bidder.toString()).join("")}</p>
            <form id="${bidFormId}" class="bid-form">
              <div>
                <label for="bidAmount-${lot.id}">Bid Amount:</label>
                <input type="number" id="bidAmount-${lot.id}" min="1" required>
              </div>
              <button type="submit">Place Bid</button>
            </form>
          </div>
        `;

        // Add event listener for bid form if it exists
        const bidForm = document.getElementById(bidFormId);
        if (bidForm) {
          bidForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const amount = parseInt(
              (
                document.getElementById(
                  `bidAmount-${lot.id}`
                ) as HTMLInputElement
              ).value
            );
            await placeBid(lot.id, amount);
          });
        }
      });
    }

    if (closedLots.lots.length === 0) {
      closedLotsDiv.innerHTML += "<p>No closed lots</p>";
    } else {
      closedLots.lots.forEach((lot, index) => {
        closedLotsDiv.innerHTML += `
          <div class="lot">
            <h5>Name: ${lot.name}</h5>
            <p>Description: ${lot.description}</p>
            <p>Ended at: ${new Date(Number(lot.end_time) / 1000000).toLocaleString()}</p>
            <p>Status: ${
              "ClosedWithWinner" in lot.status
                ? `Closed - Winner: ${lot.status.ClosedWithWinner.toString()}`
                : `Closed - No Winner`
            }</p>
            <p>Have I bid: ${closedLots.bids[index].find((bid) => bid[0].compareTo(myPrincipal as Principal) === "eq") ? "Yes" : "No"}</p>
            <p>Bids: ${closedLots.bids[index].length === 0 ? " no bids yet" : closedLots.bids[index].map((bid) => `<br>${bid[0].toString()}: ${bid[1]}`).join("")}</p>
          </div>
        `;
      });
    }

    document.getElementById("lotsList")!.style.display = "block";
  } catch (error) {
    alert(`Failed to list lots: ${error}`);
  }
}

async function placeBid(lotId: bigint, amount: number) {
  try {
    // Get the root IBE public key
    const rootIbePublicKey = await getRootIbePublicKey();
    const lotIdBytes = u128ToLeBytes(lotId);
    const amountBytes = u128ToLeBytes(BigInt(amount));

    // Generate a random seed for encryption
    const seed = window.crypto.getRandomValues(new Uint8Array(32));

    // Encrypt the bid amount using IBE
    const encryptedAmount = IdentityBasedEncryptionCiphertext.encrypt(
      rootIbePublicKey,
      lotIdBytes,
      amountBytes,
      seed
    );

    console.log("encryptedAmount", JSON.stringify(encryptedAmount.serialize()));

    // Place the bid
    const result = await getBasicTimelockIbeCanister().place_bid(
      lotId,
      encryptedAmount.serialize()
    );
    if ("Err" in result) {
      alert(`Failed to place bid: ${result.Err}`);
      return;
    }

    alert("Bid placed successfully!");
    // Refresh the lots list
    await listLots();
  } catch (error) {
    alert(`Failed to place bid: ${error}`);
  }
}

function u128ToLeBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(16);
  let temp = value;

  for (let i = 0; i < 16; i++) {
    bytes[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }

  return bytes;
}

// Initialize auth
initAuth();
