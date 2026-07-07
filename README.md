# ArcCredit - Bilateral USDC Credit Facilities on Arc Testnet

ArcCredit is a bilateral USDC credit facility platform built for Arc Testnet. It lets one wallet provide a controlled credit line to another wallet, enabling transparent borrowing, repayment, and facility management through smart contracts.

This is a testnet credit-management product rather than a public lending pool. Each facility is created between a specific capital provider and a specific borrower, making the relationship explicit and traceable onchain.

A capital provider can define a borrower, set a maximum USDC credit limit, fund the facility, and control whether further drawdowns are allowed. The borrower can draw USDC up to the available credit limit and repay the outstanding balance over time.

## Product screenshots

### Issuer console

![ArcCredit issuer console](docs/screenshots/issuer-console.png)

### Borrower and servicing console

![ArcCredit borrower and servicing console](docs/screenshots/borrower-servicing-console.png)

## Core onchain lifecycle

```text
Issuer Approve USDC
-> Issuer openFacility(borrower, limit, maturity, fee)
-> Borrower draw(facilityId, amount)
-> Borrower Approve USDC
-> Borrower repay(facilityId, amount)
-> Issuer freezeDraws / closeFacility
```

## Non-custodial model

- The user signs every state-changing transaction in MetaMask, OKX Wallet, or another compatible browser wallet.
- The frontend and any optional backend never ask for or store private keys.
- USDC is held only by the deployed `ArcCreditLine` contract when a facility is funded or a repayment is received.
- The issuer determines the borrower and facility terms. This is a testnet protocol demonstration, not consumer lending or financial advice.

## Architecture

- Frontend: React, TypeScript, Vite, Tailwind CSS, Framer Motion, viem, Radix Dialog.
- Wallet: EIP-6963 browser-wallet discovery, account/network display, Arc Testnet switching, transaction receipts, explorer links.
- Contract: Solidity `ArcCreditLine.sol` with issuer-funded bilateral facilities.
- Chain: Arc Testnet.

## Local frontend setup

```bat
cd /d "D:\py\arc\arccredit-starter\arccredit"
npm install
copy .env.example .env
npm run dev
```

Open the local Vite address, usually `http://localhost:5173`.

Before contract deployment, the frontend displays an explicit configuration state and blocks fake contract actions.

## Deploy `ArcCreditLine` with Remix

1. Open [Remix IDE](https://remix.ethereum.org).
2. Create `ArcCreditLine.sol` and paste `contracts/src/ArcCreditLine.sol`.
3. Select compiler `0.8.24`, then compile.
4. Open **Deploy & Run Transactions**.
5. Set Environment to **Browser Extension** or **Injected Provider** and connect a wallet on Arc Testnet.
6. Select `ArcCreditLine`.
7. In constructor parameter `usdc_`, paste:

```text
0x3600000000000000000000000000000000000000
```

8. Click **Deploy** and confirm in the wallet.
9. Copy the deployed contract address, then set it in `.env`:

```env
VITE_ARC_CREDIT_ADDRESS=0xYourArcCreditLineAddress
```

10. Stop and restart `npm run dev`.

## Deploy with Foundry

From `contracts/`:

```bash
forge build
forge script script/DeployArcCredit.s.sol:DeployArcCredit \
  --rpc-url https://rpc.testnet.arc.network \
  --broadcast \
  --private-key $PRIVATE_KEY
```

Use a dedicated testnet deployment wallet. Arc Testnet uses USDC for gas, so the deployment wallet needs testnet USDC.

## Arc Testnet settings used by the app

```text
Network: Arc Testnet
Chain ID: 5042002
RPC: https://rpc.testnet.arc.network
Explorer: https://testnet.arcscan.app
USDC ERC-20 interface: 0x3600000000000000000000000000000000000000
```

## Contract operations

### `openFacility`

Issuer approves the contract to spend USDC, then funds a credit line for one borrower. The facility stores credit limit, remaining capacity, outstanding balance, maturity, and fee.

### `draw`

Only the nominated borrower may draw. The borrower receives the requested amount minus the configured draw fee; the fee is paid directly to the issuer. The borrower remains responsible for repaying the gross draw amount.

### `repay`

Only the borrower may repay. The contract pulls approved USDC from the borrower, reduces outstanding debt, and increases remaining capacity. Repayment remains possible after maturity or a draw freeze.

### `freezeDraws`

Only the issuer may freeze a facility. New draws stop, but repayment continues.

### `closeFacility`

Only the issuer may close a fully repaid facility. The contract returns all available USDC to the issuer.

## Important scope note

This is a testnet builder prototype and has not been audited. Do not use with production assets. It does not perform identity verification, underwriting, collections, liquidation, or regulatory compliance workflows.
