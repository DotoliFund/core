import { BigNumber, BigNumberish, constants, Contract, ContractTransaction, utils, Wallet } from 'ethers'


export function getCreate2Address(
  fundAddress: string,
  walletAddress: string,
): string {
  const constructorArgumentsEncoded = utils.defaultAbiCoder.encode(
    ['address', 'address'],
    [fundAddress, walletAddress]
  )
  const create2Inputs = [
    '0xff',
    // salt
    utils.keccak256(constructorArgumentsEncoded),
  ]
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join('')}`
  return utils.getAddress(`0x${utils.keccak256(sanitizedInputs).slice(-40)}`)
}