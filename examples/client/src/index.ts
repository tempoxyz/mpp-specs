import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fetchWithPayment } from "./payment-client.js";

const TEMPO_RPC = "https://rpc.tempo.xyz";
const TEMPO_CHAIN = {
  id: 42431,
  name: "Tempo",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [TEMPO_RPC] } },
} as const;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: PRIVATE_KEY environment variable is required");
    console.error("Usage: PRIVATE_KEY=0x... pnpm start");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const wallet = createWalletClient({
    account,
    chain: TEMPO_CHAIN,
    transport: http(TEMPO_RPC),
  });

  console.log(`Wallet address: ${account.address}`);

  const apiUrl = process.env.API_URL || "https://api.example.com/paid-resource";
  console.log(`\nFetching: ${apiUrl}`);

  try {
    const { response, receipt, paid } = await fetchWithPayment(apiUrl, wallet);

    if (paid) {
      console.log(`\nPayment completed!`);
    }

    if (response.ok) {
      const data = await response.json();
      console.log(`\nResponse:`, data);
    } else {
      console.error(`\nRequest failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text);
    }

    if (receipt) {
      console.log(`\nPayment receipt:`, receipt);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
