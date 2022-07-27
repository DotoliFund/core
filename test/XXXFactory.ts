import { expect } from "chai";
import { Wallet } from 'ethers'
import { ethers } from 'hardhat';
import { XXXFactory } from '../typechain-types/XXXFactory';

import { getCreate2Address } from './shared/utilities'


const { waffle } = require("hardhat");
const { createFixtureLoader } = waffle;



describe('XXXFactory', () => {
  let wallet: Wallet, other: Wallet
  let factory: XXXFactory
  let fundBytecode: string
  const fixture = async () => {
    const factoryFactory = await ethers.getContractFactory('XXXFactory')
    return (await factoryFactory.deploy()) as XXXFactory
  }

  let loadFixture: ReturnType<typeof createFixtureLoader>
  before('create fixture loader', async () => {
    ;[wallet, other] = await (ethers as any).getSigners()

    loadFixture = createFixtureLoader([wallet, other])
  })

  before('load pool bytecode', async () => {
    fundBytecode = (await ethers.getContractFactory('XXXFund')).bytecode
  })

  beforeEach('deploy factory', async () => {
    factory = await loadFixture(fixture)
  })

  it('owner is deployer', async () => {
    expect(await factory.owner()).to.eq(wallet.address)
  })


  async function createAndCheckFund(
    tokens: [string, string],
  ) {
    const create2Address = getCreate2Address(fundBytecode, wallet.address)
    const create = factory.createFund(wallet.address)
    const fundCount = 1

    await expect(create)
      .to.emit(factory, 'PoolCreated')
      .withArgs(wallet.address, create2Address, fundCount)

    await expect(factory.createFund(wallet.address)).to.be.reverted
    await expect(factory.createFund(wallet.address)).to.be.reverted
    expect(await factory.getFund(wallet.address), 'getFund in order').to.eq(create2Address)
    expect(await factory.getFund(wallet.address), 'getFund in reverse').to.eq(create2Address)

    const poolContractFactory = await ethers.getContractFactory('UniswapV3Pool')
    const pool = poolContractFactory.attach(create2Address)
    expect(await pool.factory(), 'pool factory address').to.eq(factory.address)
  }


  // describe('#createFund', () => {
  //   it('succeeds for create fund', async () => {
  //     await createAndCheckFund(TEST_ADDRESSES, FeeAmount.LOW)
  //   })

  //   it('succeeds if tokens are passed in reverse', async () => {
  //     await createAndCheckFund([TEST_ADDRESSES[1], TEST_ADDRESSES[0]], FeeAmount.MEDIUM)
  //   })

  //   it('fails if token a == token b', async () => {
  //     await expect(factory.createFund(TEST_ADDRESSES[0], TEST_ADDRESSES[0], FeeAmount.LOW)).to.be.reverted
  //   })

  //   it('fails if token a is 0 or token b is 0', async () => {
  //     await expect(factory.createFund(TEST_ADDRESSES[0], constants.AddressZero, FeeAmount.LOW)).to.be.reverted
  //     await expect(factory.createFund(constants.AddressZero, TEST_ADDRESSES[0], FeeAmount.LOW)).to.be.reverted
  //     await expect(factory.createFund(constants.AddressZero, constants.AddressZero, FeeAmount.LOW)).to.be.revertedWith(
  //       ''
  //     )
  //   })

  // })




})