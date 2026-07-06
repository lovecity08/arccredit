# ArcCredit - Project Summary

**ArcCredit** is a wallet-native, bilateral USDC credit-facility prototype for Arc Testnet.

It lets an issuer approve and fund a specific borrower with a defined credit limit, maturity, and draw fee. The borrower can draw and repay within that facility, while the issuer may freeze undrawn capacity and reclaim cash only after full repayment.

## What makes it different

- **Bilateral facility model:** an issuer explicitly funds a named borrower rather than depositing into an anonymous lending pool.
- **Transparent state machine:** Funded -> Active -> Drawn / Repaid -> Frozen / Closed.
- **Real onchain flow:** issuer `Approve -> openFacility`; borrower `draw`; borrower `Approve -> repay`; issuer `freezeDraws / closeFacility`.
- **Non-custodial:** no backend private keys, wallet custody, or offchain signing.
- **Arc-native testnet settlement:** interactions use Arc Testnet and its USDC interface; the user signs all state-changing actions in their own EVM wallet.

## Contract

`contracts/src/ArcCreditLine.sol`

After deployment, configure the frontend:

```env
VITE_ARC_CREDIT_ADDRESS=0xYourDeployedArcCreditLineAddress
```

## Demo sequence

1. Connect MetaMask or OKX Wallet and switch to Arc Testnet.
2. Issuer approves 125 USDC and opens a facility for a borrower wallet.
3. Borrower loads the Facility ID, draws 25 USDC, and views the available capacity change.
4. Borrower approves and repays 25 USDC.
5. Issuer freezes draws or closes the fully repaid facility to reclaim USDC.

> Testnet-only prototype. The contract has not been independently audited and does not provide lending, investment, or credit advice.
