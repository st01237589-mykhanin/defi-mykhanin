import { readFile, writeFile } from "node:fs/promises";

export const CCIP = {
  sepolia: {
    router: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
    link: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
    chainSelector: 16015286601757825753n,
  },
  arbitrumSepolia: {
    router: "0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165",
    link: "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E",
    chainSelector: 3478487238524512106n,
  },
};

export const LINK_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address, uint256) returns (bool)",
];

const DEPLOYMENT_FILE = "deployment.json";

export async function readDeployment(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(DEPLOYMENT_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function saveDeployment(update: Record<string, string>) {
  const deployment = { ...(await readDeployment()), ...update };
  await writeFile(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2) + "\n");
  return deployment;
}
