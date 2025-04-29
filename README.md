# Dune Echo Demo

A modern, real-time portfolio tracker powered by Dune's Echo API. Monitor token balances and transactions across multiple chains with a sleek, responsive interface.

## Features

### Portfolio Tracking
- 🔄 Real-time token balance updates
- 📊 Multi-chain support with unified view
- 💰 USD value conversion for all tokens
- 📈 Price change sparklines with 24h performance

### Transaction Monitoring
- ⚡ Live transaction ticker
- 💹 24h net flow badge
- ✨ Balance change animations
- 🔍 Transaction history with detailed view

### Analytics & Export
- 📊 Portfolio distribution charts
- 💎 Chain-wise total balances
- 📥 CSV export functionality
- 🔗 Shareable portfolio links


## API Integration

This demo uses Dune's Echo API endpoints:

```typescript
// Token Balances
GET https://api.dune.com/api/echo/beta/balances/evm/{address}

// Transactions
GET https://api.dune.com/api/echo/beta/transactions/evm/{address}

// Token Prices
GET https://api.dune.com/api/echo/beta/tokens/evm/{contract_address}
```

## Quick Start

1. Clone the repository
```bash
git clone https://github.com/yourusername/dune-echo-demo.git
```

2. Install dependencies
```bash
npm install
```

3. Add your Dune API key to `.env`:
```bash
REACT_APP_DUNE_API_KEY=your_api_key_here
```

4. Start the development server
```bash
npm start
```

## Tech Stack

- React 18
- TypeScript
- Dune Echo API
- Ethers.js
- Recharts
- Web3 Tools
