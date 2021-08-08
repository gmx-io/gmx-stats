import { ethers } from 'ethers'

import Vault from '../abis/v1/Vault'
import Token from '../abis/v1/Token'
import ChainlinkFeed from '../abis/ChainlinkFeed'
import { getProvider } from './helpers'
import { addresses } from './addresses'

export const vaultAbi = Vault.abi
export const tokenAbi = Token.abi
const chainlinkFeedAbi = ChainlinkFeed.abi

export function attachContract(address, abi, signer) {
  const provider = getProvider()
  if (!signer) {
    signer = ethers.Wallet.createRandom().connect(provider) 
  }
  const contract = new ethers.Contract(address, abi, signer)
  return contract
}

export const vaultContract = attachContract(addresses.Vault, vaultAbi)
export const usdgContract = attachContract(addresses.USDG, tokenAbi)

const chainlinkBtcFeedContract = attachContract(addresses.ChainlinkBtcFeed, chainlinkFeedAbi)
const chainlinkEthFeedContract = attachContract(addresses.ChainlinkEthFeed, chainlinkFeedAbi)
const chainlinkBnbFeedContract = attachContract(addresses.ChainlinkBnbFeed, chainlinkFeedAbi)

export const chainlinkFeedContracts = {
  BTC: chainlinkBtcFeedContract,
  ETH: chainlinkEthFeedContract,
  BNB: chainlinkBnbFeedContract
}
