import { expect } from "chai";
import { Wallet } from 'ethers'
import { ethers } from 'hardhat';
import { XXXFactory } from '../typechain-types/XXXFactory';
const { waffle } = require("hardhat");
const { createFixtureLoader } = waffle;



describe('XXXFactory', () => {
  let wallet: Wallet, other: Wallet

  let factory: XXXFactory
  let poolBytecode: string
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
    poolBytecode = (await ethers.getContractFactory('XXXFund')).bytecode
  })

  beforeEach('deploy factory', async () => {
    factory = await loadFixture(fixture)
  })

  it('owner is deployer', async () => {
    expect(await factory.owner()).to.eq(wallet.address)
  })

})