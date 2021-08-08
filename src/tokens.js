export const TOKENS = [
  {
    symbol: 'BTC',
    address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    defaultPrice: 35000,
    coingeckoId: 'bitcoin'
  },
  {
    symbol: 'ETH',
    address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    defaultPrice: 2000,
    coingeckoId: 'ethereum'
  },
  {
    symbol: 'BNB',
    address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    defaultPrice: 300,
    coingeckoId: 'binancecoin'
  },
  {
    symbol: 'USDG',
    address: '0x85E76cbf4893c1fbcB34dCF1239A91CE2A4CF5a7',
    defaultPrice: 1
  },
  {
    symbol: 'BUSD',
    address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    defaultPrice: 1,
    stable: true 
  },
  {
    symbol: 'USDT',
    address: '0x55d398326f99059fF775485246999027B3197955',
    defaultPrice: 1,
    stable: true 
  },
  {
    symbol: 'USDC',
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    defaultPrice: 1,
    stable: true 
  }
]

export const TOKENS_BY_SYMBOL = TOKENS.reduce((memo, token) => {
  memo[token.symbol] = token
  return memo
}, {})

export const TOKENS_BY_ADDRESS = TOKENS.reduce((memo, token) => {
  memo[token.address] = token
  return memo
}, {})