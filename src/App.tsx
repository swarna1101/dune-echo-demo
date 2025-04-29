import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DuneProvider, useTokenBalances, useTransactions } from '@duneanalytics/hooks';
import { ethers, isAddress } from 'ethers';
import { 
  ClipboardDocumentIcon, 
  SunIcon, 
  MoonIcon, 
  CheckIcon,
  ChartPieIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ShareIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  DocumentArrowDownIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, YAxis } from 'recharts';
import numeral from 'numeral';
import CopyToClipboard from 'react-copy-to-clipboard';
import Papa from 'papaparse';
import './App.css';

const API_KEY = process.env.REACT_APP_DUNE_API_KEY || '';

const formatNumber = (value: number | string | undefined | null) => {
  if (value === undefined || value === null || value === '') return '0.00';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '0.00';

  // Handle very small numbers (less than 0.01)
  if (numValue > 0 && numValue < 0.01) {
    return '< 0.01';
  }

  // Format based on size
  if (numValue >= 1e9) return numeral(numValue.toString()).format('0.00b').toUpperCase();
  if (numValue >= 1e6) return numeral(numValue.toString()).format('0.00a').toUpperCase();
  if (numValue >= 1e3) return numeral(numValue.toString()).format('0,0.00');
  return numeral(numValue.toString()).format('0.00');
};

const formatCurrency = (value: number | string | undefined | null) => {
  if (value === undefined || value === null || value === '') return '$0.00';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '$0.00';

  // Handle very small values
  if (numValue > 0 && numValue < 0.01) {
    return '< $0.01';
  }

  // Format based on size
  if (numValue >= 1e9) return `$${numeral(numValue.toString()).format('0.00b').toUpperCase()}`;
  if (numValue >= 1e6) return `$${numeral(numValue.toString()).format('0.00a').toUpperCase()}`;
  if (numValue >= 1e3) return `$${numeral(numValue.toString()).format('0,0.00')}`;
  return `$${numeral(numValue.toString()).format('0.00')}`;
};

const resolveENS = async (input: string): Promise<string> => {
  if (isAddress(input)) return input;
  try {
    const provider = ethers.getDefaultProvider();
    const address = await provider.resolveName(input);
    return address || '';
  } catch {
    return '';
  }
};

interface PortfolioPieProps {
  balances: any[];
  onClose: () => void;
}

const COLORS = ['#F4603E', '#1E1870', '#22c55e', '#3b82f6', '#8b5cf6'];
const OTHER_COLOR = '#6b7280';

const PortfolioPie: React.FC<PortfolioPieProps> = ({ balances, onClose }) => {
  const pieData = useMemo(() => {
    // Sort balances by value_usd
    const sortedBalances = [...balances].sort((a, b) => 
      (b.value_usd || 0) - (a.value_usd || 0)
    );

    // Calculate total portfolio value
    const totalValue = sortedBalances.reduce((sum, token) => 
      sum + (parseFloat(token.value_usd) || 0), 0
    );

    if (totalValue === 0) return [];

    // Take top 5 tokens
    const topTokens = sortedBalances.slice(0, 5);
    
    // Calculate "Others" value
    const othersValue = sortedBalances.slice(5).reduce((sum, token) => 
      sum + (parseFloat(token.value_usd) || 0), 0
    );

    // Create pie data
    const data = topTokens.map(token => ({
      name: token.symbol,
      value: parseFloat(token.value_usd) || 0,
      percentage: ((parseFloat(token.value_usd) || 0) / totalValue * 100).toFixed(1)
    }));

    // Add "Others" if there are more tokens
    if (othersValue > 0) {
      data.push({
        name: 'Others',
        value: othersValue,
        percentage: (othersValue / totalValue * 100).toFixed(1)
      });
    }

    return data;
  }, [balances]);

  return (
    <div className="portfolio-modal">
      <div className="portfolio-content">
        <div className="portfolio-header">
          <h3>Portfolio Distribution</h3>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        <div className="portfolio-chart">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`}
                    fill={index < COLORS.length ? COLORS[index] : OTHER_COLOR}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any, props: any) => [
                  `${props.payload.percentage}% ($${formatNumber(value)})`,
                  name
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          
          <div className="portfolio-legend">
            {pieData.map((entry, index) => (
              <div key={entry.name} className="legend-item">
                <div 
                  className="legend-color"
                  style={{ backgroundColor: index < COLORS.length ? COLORS[index] : OTHER_COLOR }}
                />
                <span className="legend-label">{entry.name}</span>
                <span className="legend-value">{entry.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface TokenPriceData {
  chain: string;
  chain_id: number;
  price_usd: number;
  symbol: string;
}

interface TokenPriceResponse {
  contract_address: string;
  tokens: TokenPriceData[];
}

const TokenSparkline = ({ 
  contractAddress, 
  chain, 
  amount 
}: { 
  contractAddress: string;
  chain: string;
  amount: string;
}) => {
  const [priceData, setPriceData] = useState<TokenPriceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTokenPrice = async () => {
      try {
        const options = {
          method: 'GET',
          headers: { 'X-Dune-Api-Key': API_KEY }
        };

        const response = await fetch(
          `https://api.dune.com/api/echo/beta/tokens/evm/${contractAddress}`,
          options
        );

        if (!response.ok) {
          throw new Error('Failed to fetch token price');
        }

        const data: TokenPriceResponse = await response.json();
        const tokenData = data.tokens.find(t => t.chain === chain.toLowerCase());
        setPriceData(tokenData || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch price data');
      } finally {
        setIsLoading(false);
      }
    };

    if (contractAddress && chain) {
      fetchTokenPrice();
    }
  }, [contractAddress, chain]);

  if (isLoading || error || !priceData) {
    return null;
  }

  // Mock data for sparkline - in production, you'd use historical data
  const sparklineData = Array.from({ length: 30 }, (_, i) => ({
    value: priceData.price_usd * (1 + Math.sin(i / 5) * 0.1)
  }));

  const priceChange = ((sparklineData[29].value - sparklineData[0].value) / sparklineData[0].value) * 100;
  const isPositive = priceChange >= 0;

  return (
    <div className="sparkline-container">
      <div className="sparkline">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparklineData}>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={isPositive ? '#22c55e' : '#ef4444'}
              strokeWidth={1}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
        {isPositive ? <ArrowUpIcon width={12} /> : <ArrowDownIcon width={12} />}
        {Math.abs(priceChange).toFixed(1)}%
      </div>
    </div>
  );
};

interface Transaction {
  hash: string;
  to: string;
  from: string;
  value: string;
  value_usd?: string;
  block_time?: string;
  chain: string;
  symbol?: string;
}

interface TickerTransaction {
  hash: string;
  amount: number;
  symbol: string;
  chain: string;
  isPositive: boolean;
}

const LiveTicker = ({ address }: { address: string }) => {
  const { data, isLoading } = useTransactions(address);
  const [transactions, setTransactions] = useState<TickerTransaction[]>([]);

  useEffect(() => {
    if (data?.transactions) {
      const recentTx = data.transactions
        .filter(tx => parseFloat(tx.value || '0') > 0) // Filter out zero-value transactions
        .slice(0, 20)
        .map(tx => ({
          hash: tx.hash,
          amount: parseFloat(tx.value || '0'),
          symbol: (tx as any).symbol || 'ETH',
          chain: tx.chain,
          isPositive: tx.to?.toLowerCase() === address.toLowerCase()
        }));
      setTransactions(recentTx);
    }
  }, [data, address]);

  useEffect(() => {
    const pollInterval = setInterval(() => {
      // Trigger refetch if available
    }, 5000);

    return () => clearInterval(pollInterval);
  }, []);

  if (isLoading || !transactions.length) return null;

  return (
    <div className="ticker-container">
      <div className="ticker">
        {[...transactions, ...transactions].map((tx, i) => (
          <div key={`${tx.hash}-${i}`} className="ticker-item">
            <span className={`ticker-amount ${tx.isPositive ? 'positive' : 'negative'}`}>
              {tx.isPositive ? '+' : '–'}{formatNumber(tx.amount)} {tx.symbol}
            </span>
            <span className="ticker-chain">• {tx.chain}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const NetFlowBadge = ({ address }: { address: string }) => {
  const { data, isLoading } = useTransactions(address);
  const [netFlow, setNetFlow] = useState(0);

  useEffect(() => {
    if (data?.transactions) {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const dayFlow = data.transactions
        .filter(tx => {
          const txDate = new Date(tx.block_time || '');
          return txDate > oneDayAgo && parseFloat(tx.value || '0') > 0;
        })
        .reduce((sum, tx) => {
          const value = parseFloat((tx as any).value_usd || tx.value || '0');
          return sum + (tx.to?.toLowerCase() === address.toLowerCase() ? value : -value);
        }, 0);
      
      setNetFlow(dayFlow);
    }
  }, [data, address]);

  useEffect(() => {
    const pollInterval = setInterval(() => {
      // Trigger refetch if available
    }, 5000);

    return () => clearInterval(pollInterval);
  }, []);

  if (isLoading) return null;

  return (
    <div className="net-flow">
      <span className="net-flow-label">Net flow 24h</span>
      <div className={`net-flow-amount ${netFlow >= 0 ? 'positive' : 'negative'}`}>
        {netFlow >= 0 ? <ArrowTrendingUpIcon width={16} /> : <ArrowTrendingDownIcon width={16} />}
        {formatCurrency(Math.abs(netFlow))}
      </div>
    </div>
  );
};

const ChainTotals = ({ balances, onClose }: { balances: any[], onClose: () => void }) => {
  const chainTotals = useMemo(() => {
    const totals: { [key: string]: number } = {};
    balances.forEach(balance => {
      const chain = balance.chain;
      const value = parseFloat(balance.value_usd || '0');
      totals[chain] = (totals[chain] || 0) + value;
    });
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .filter(([, value]) => value > 0);
  }, [balances]);

  if (!chainTotals.length) return null;

  return (
    <div className="chain-totals">
      {chainTotals.map(([chain, value]) => (
        <div key={chain} className="chain-total-item">
          <span className="chain-name">{chain}</span>
          <span className="chain-value">{formatCurrency(value)}</span>
        </div>
      ))}
    </div>
  );
};

const TokenBalances = ({ address }: { address: string }) => {
  const { data, isLoading, error } = useTokenBalances(address);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [showChainTotals, setShowChainTotals] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const previousBalances = useRef<any>(null);
  const [changedTokens, setChangedTokens] = useState<{[key: string]: 'increased' | 'decreased'}>({});

  // Move all data processing into useMemo
  const { filteredBalances, chains } = useMemo(() => {
    const balances = (data?.balances || [])
      .filter(balance => {
        const amount = parseFloat(String(balance.amount || '0'));
        const value = parseFloat(String(balance.value_usd || '0'));
        return (amount > 0 || value > 0) && (!selectedChain || balance.chain === selectedChain);
      })
      .sort((a, b) => {
        const valueA = parseFloat(String(a.value_usd || '0'));
        const valueB = parseFloat(String(b.value_usd || '0'));
        return valueB - valueA;
      });

    const uniqueChains = Array.from(new Set(data?.balances.map(balance => balance.chain) || []));

    return {
      filteredBalances: balances,
      chains: uniqueChains
    };
  }, [data?.balances, selectedChain]);

  useEffect(() => {
    if (data?.balances && previousBalances.current) {
      const changes: {[key: string]: 'increased' | 'decreased'} = {};
      data.balances.forEach(balance => {
        const key = `${balance.chain}-${balance.address}`;
        const prevBalance = previousBalances.current.find(
          (b: any) => b.chain === balance.chain && b.address === balance.address
        );
        if (prevBalance) {
          const prev = parseFloat(String(prevBalance.amount || '0'));
          const curr = parseFloat(String(balance.amount || '0'));
          if (curr > prev) changes[key] = 'increased';
          if (curr < prev) changes[key] = 'decreased';
        }
      });
      setChangedTokens(changes);
      setTimeout(() => setChangedTokens({}), 1000);
    }
    if (data?.balances) {
      previousBalances.current = [...data.balances];
    }
  }, [data]);

  const handleExportCSV = () => {
    if (!filteredBalances.length) return;
    
    const csvData = filteredBalances.map(balance => ({
      Chain: balance.chain,
      Token: balance.symbol,
      Amount: balance.amount,
      'Value (USD)': balance.value_usd,
      Address: balance.address
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dune-echo-balances-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return <div className="error">Error loading token balances: {error.message}</div>;
  }

  if (isLoading) {
    return (
      <div className="token-card">
        <div className="token-info">
          <div>Loading token balances...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="section-header">
        <h2>Token Balances</h2>
        <div className="section-actions">
          <button 
            className="export-button"
            onClick={handleExportCSV}
            title="Export as CSV"
          >
            <DocumentArrowDownIcon className="export-icon" />
            Export CSV
          </button>
          <button 
            className="export-button"
            onClick={() => setShowPortfolio(true)}
            title="View Portfolio Distribution"
          >
            <ChartPieIcon className="export-icon" />
            Portfolio
          </button>
        </div>
      </div>

      <LiveTicker address={address} />
      <NetFlowBadge address={address} />

      <div className="chain-filters">
        <button
          className={`chain-filter ${selectedChain === null ? 'active' : ''}`}
          onClick={() => setSelectedChain(null)}
        >
          All
        </button>
        {chains.map(chain => (
          <button
            key={chain}
            className={`chain-filter ${selectedChain === chain ? 'active' : ''}`}
            onClick={() => setSelectedChain(chain)}
          >
            {chain}
          </button>
        ))}
      </div>

      <button
        className="chain-totals-button"
        onClick={() => setShowChainTotals(!showChainTotals)}
        title="Toggle Chain Totals"
      >
        <ChartBarIcon className="chain-totals-icon" />
      </button>

      {showChainTotals && (
        <ChainTotals 
          balances={filteredBalances} 
          onClose={() => setShowChainTotals(false)} 
        />
      )}

      <div className="token-list">
        {filteredBalances.map((balance) => {
          const key = `${balance.chain}-${balance.address}`;
          const changeClass = changedTokens[key];
          return (
            <div 
              key={key} 
              className={`token-card ${changeClass ? `balance-${changeClass}` : ''}`}
            >
              <div className="token-info">
                <div className="token-icon">
                  {(balance.symbol || '?')[0].toUpperCase()}
                </div>
                <div className="token-details">
                  <div className="token-name">{balance.symbol || 'Unknown Token'}</div>
                  <div className="token-amount">
                    {formatNumber(balance.amount)} {balance.symbol}
                  </div>
                  <TokenSparkline 
                    contractAddress={balance.address || 'native'}
                    chain={balance.chain}
                    amount={balance.amount || '0'}
                  />
                </div>
              </div>
              <div className="token-meta">
                <div className="chain-badge">{balance.chain}</div>
                <div className="token-value">{formatCurrency(balance.value_usd)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {showPortfolio && (
        <div className="modal-overlay">
          <PortfolioPie 
            balances={filteredBalances} 
            onClose={() => setShowPortfolio(false)} 
          />
        </div>
      )}
    </>
  );
};

const Transactions = ({ address }: { address: string }) => {
  const { data, isLoading, error } = useTransactions(address);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<string | null>(null);

  if (error) {
    return <div className="error">Error loading transactions: {error.message}</div>;
  }

  if (isLoading) {
    return (
      <div className="transaction-card">
        <div className="transaction-header">
          <div>Loading transactions...</div>
        </div>
      </div>
    );
  }

  const chains = Array.from(new Set(data?.transactions.map(tx => tx.chain) || []));
  const filteredTransactions = data?.transactions.filter(tx => 
    !selectedChain || tx.chain === selectedChain
  ) || [];

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return 'Unknown Date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(date);
    } catch {
      return 'Invalid Date';
    }
  };

  const formatAddress = (address: string | undefined | null) => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleCopy = (hash: string) => {
    setCopiedHash(hash);
    setTimeout(() => {
      setCopiedHash(null);
    }, 2000);
  };

  return (
    <>
      <div className="chain-filters">
        <button
          className={`chain-filter ${selectedChain === null ? 'active' : ''}`}
          onClick={() => setSelectedChain(null)}
        >
          All
        </button>
        {chains.map(chain => (
          <button
            key={chain}
            className={`chain-filter ${selectedChain === chain ? 'active' : ''}`}
            onClick={() => setSelectedChain(chain)}
          >
            {chain}
          </button>
        ))}
      </div>

      <div className="token-list">
        {filteredTransactions.map((tx) => (
          <div key={tx.hash || Math.random()} className="transaction-card">
            <div className="transaction-header">
              <CopyToClipboard text={tx.hash || ''} onCopy={() => handleCopy(tx.hash || '')}>
                <div className="transaction-hash">
                  <span className="transaction-hash-text">
                    {tx.hash ? formatAddress(tx.hash) : 'Unknown Hash'}
                  </span>
                  {copiedHash === tx.hash ? (
                    <CheckIcon className="copy-icon copy-success" />
                  ) : (
                    <ClipboardDocumentIcon className="copy-icon" />
                  )}
                </div>
              </CopyToClipboard>
              <div className="transaction-date">
                {formatDate(tx.block_time)}
              </div>
            </div>

            <div className="transaction-addresses">
              <div className="transaction-address">
                <span className="address-label">From:</span>
                <span className="address-value">{formatAddress(tx.from)}</span>
              </div>
              <div className="transaction-address">
                <span className="address-label">To:</span>
                <span className="address-value">{formatAddress(tx.to)}</span>
              </div>
            </div>

            <div className="transaction-meta">
              <div className="chain-badge">{tx.chain || 'Unknown'}</div>
              <div className="token-value">
                {formatNumber(tx.value || 0)} ETH
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

interface ENSData {
  name: string;
  avatar: string;
}

const App = () => {
  const [input, setInput] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const [resolvedENS, setResolvedENS] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [loadingENS, setLoadingENS] = useState(false);
  const [ensError, setENSError] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [ensData, setENSData] = useState<ENSData | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [copiedShare, setCopiedShare] = useState(false);

  // Parse URL parameters on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addrParam = params.get('addr');
    const tabParam = params.get('tab');
    
    if (addrParam) {
      setInput(addrParam);
      setSearchAddress(addrParam);
      handleSearch(addrParam);
    }
    
    if (tabParam === 'transactions') {
      setActiveTab(1);
    }
  }, []);

  // Update URL when address or tab changes
  useEffect(() => {
    if (searchAddress) {
      const params = new URLSearchParams();
      params.set('addr', searchAddress);
      params.set('tab', activeTab === 0 ? 'balances' : 'transactions');
      
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', newUrl);
      
      setShareLink(window.location.origin + newUrl);
    }
  }, [searchAddress, activeTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  const fetchENSData = async (address: string) => {
    try {
      const provider = ethers.getDefaultProvider();
      const name = await provider.lookupAddress(address);
      
      if (name) {
        const resolver = await provider.getResolver(name);
        const avatar = await resolver?.getText('avatar') || '';
        setENSData({ name, avatar });
        setResolvedENS(name);
      } else {
        setENSData(null);
      }
    } catch (error) {
      console.error('Error fetching ENS data:', error);
      setENSData(null);
    }
  };

  const handleSearch = async (inputValue?: string) => {
    const searchValue = inputValue || input;
    setENSError('');
    setLoadingENS(true);
    const address = await resolveENS(searchValue.trim());
    setLoadingENS(false);
    
    if (!address) {
      setENSError('Invalid address or ENS name.');
      setSearchAddress('');
      setResolvedENS('');
      setENSData(null);
      return;
    }
    
    setSearchAddress(address);
    await fetchENSData(address);
  };

  const handleShareCopy = () => {
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  return (
    <DuneProvider duneApiKey={API_KEY}>
      <div className="app">
        <div className="header">
          <h1>Dune Echo Demo</h1>
          <div className="header-actions">
            {searchAddress && (
              <CopyToClipboard text={shareLink} onCopy={handleShareCopy}>
                <button className="share-button" title="Copy share link">
                  {copiedShare ? (
                    <CheckIcon className="share-icon" />
                  ) : (
                    <ShareIcon className="share-icon" />
                  )}
                </button>
              </CopyToClipboard>
            )}
            <button 
              className="theme-toggle" 
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
            >
              {darkMode ? <SunIcon className="theme-icon" /> : <MoonIcon className="theme-icon" />}
            </button>
          </div>
        </div>

        <div className="search-container">
          <label htmlFor="wallet-input">
            Enter Wallet Address or ENS Name
          </label>
          <div className="input-group">
            {ensData?.avatar && (
              <img 
                src={ensData.avatar} 
                alt={`${ensData.name} avatar`} 
                className="ens-avatar"
              />
            )}
            <input
              id="wallet-input"
              type="text"
              placeholder="e.g., vitalik.eth or 0x..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className={`input ${ensData?.avatar ? 'with-avatar' : ''}`}
            />
            <button onClick={() => handleSearch()} className="button" disabled={loadingENS}>
              {loadingENS ? 'Resolving...' : 'Search'}
            </button>
          </div>
        </div>

        {ensError && <div className="error">{ensError}</div>}
        
        {resolvedENS && (
          <div className="ens-result">
            <span>ENS <strong>{resolvedENS}</strong> resolved to:</span>
            <div className="address-container">
              <code>{searchAddress}</code>
              <CopyToClipboard text={searchAddress}>
                <ClipboardDocumentIcon className="copy-icon" />
              </CopyToClipboard>
            </div>
          </div>
        )}

        {searchAddress && (
          <>
            <div className="tabs">
              <button
                className={`tab ${activeTab === 0 ? 'active' : ''}`}
                onClick={() => setActiveTab(0)}
              >
                Token Balances
              </button>
              <button
                className={`tab ${activeTab === 1 ? 'active' : ''}`}
                onClick={() => setActiveTab(1)}
              >
                Transactions
              </button>
            </div>
            {activeTab === 0 && <TokenBalances address={searchAddress} />}
            {activeTab === 1 && <Transactions address={searchAddress} />}
          </>
        )}
      </div>
    </DuneProvider>
  );
};

export default App;
