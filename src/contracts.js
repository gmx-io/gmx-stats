import { ethers } from 'ethers'

import Vault from '../abis/v1/Vault'
import Token from '../abis/v1/Token'
import ChainlinkFeed from '../abis/ChainlinkFeed'
import YieldToken from '../abis/YieldToken'
import { getProvider } from './helpers'
import { addresses, BSC, ARBITRUM } from './addresses'

export const vaultAbi = Vault.abi
export const tokenAbi = Token.abi
export const yieldTokenAbi = YieldToken.abi
const chainlinkFeedAbi = ChainlinkFeed.abi

export function attachContract(address, abi, chainId) {
  const provider = getProvider(chainId)
  const contract = new ethers.Contract(address, abi, provider)
  return contract
}

const vaultContract = attachContract(addresses[BSC].Vault, vaultAbi, BSC)
const usdgContract = attachContract(addresses[BSC].USDG, tokenAbi, BSC)

const chainlinkBtcFeedContract = attachContract(addresses[BSC].ChainlinkBtcFeed, chainlinkFeedAbi, BSC)
const chainlinkEthFeedContract = attachContract(addresses[BSC].ChainlinkEthFeed, chainlinkFeedAbi, BSC)
const chainlinkBnbFeedContract = attachContract(addresses[BSC].ChainlinkBnbFeed, chainlinkFeedAbi, BSC)

const chainlinkFeedContracts = {
  BTC: chainlinkBtcFeedContract,
  ETH: chainlinkEthFeedContract,
  BNB: chainlinkBnbFeedContract
}

export const contracts = {
  [BSC]: {
    vaultContract,
    usdgContract,
    chainlinkFeedContracts
  },
  [ARBITRUM]: {
    chainlinkFeedContracts: {
      BTC: attachContract(addresses[ARBITRUM].ChainlinkBtcFeed, chainlinkFeedAbi, ARBITRUM),
      ETH: attachContract(addresses[ARBITRUM].ChainlinkEthFeed, chainlinkFeedAbi, ARBITRUM)
    },
    GMX: attachContract(addresses[ARBITRUM].GMX, yieldTokenAbi, ARBITRUM)
  }
}
