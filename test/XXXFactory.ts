import { Wallet, constants, BigNumber, Contract } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { XXXFactory } from '../typechain-types/contracts/XXXFactory'
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2'
import { getCreate2Address } from './shared/utilities'

import { 
  NULL_ADDRESS,
  WETH9,
  V3_SWAP_ROUTER_ADDRESS,
  MANAGER_FEE,
  WHITE_LIST_TOKENS,
} from "./shared/constants"


describe('XXXFactory', () => {

  let deployer: Wallet 
  let manager1: Wallet
  let manager2: Wallet
  let investor: Wallet
  let investor2: Wallet
  let notInvestor: Wallet

  let factoryContractAddress: string
  let fundContractAddress: string

  let fund1Address: string
  let fund2Address: string

  let factory: Contract
  let fund1: Contract
  let fund2: Contract
  let WETH9: Contract
  
  before('get signer', async () => {
    [ deployer, 
      manager1, 
      manager2, 
      investor, 
      investor2,
      notInvestor
    ] = await (ethers as any).getSigners()
  })

  before("Deploy XXXFactory Contract", async function () {
    const XXXFactory = await ethers.getContractFactory("XXXFactory")
    const Factory = await XXXFactory.connect(deployer).deploy()
    await Factory.deployed()
    factoryContractAddress = Factory.address
    factory = await ethers.getContractAt("XXXFactory", factoryContractAddress)
  })

  before("Deploy XXXFund2 Contract", async function () {
    const XXXFund = await ethers.getContractFactory("XXXFund2")
    const Fund = await XXXFund.connect(deployer).deploy()
    await Fund.deployed()
    fundContractAddress = Fund.address
  })

  it("create 1st fund", async function () {
    await factory.connect(manager1).createFund()
    const fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
    const expectedFundAddress = getCreate2Address(factoryContractAddress, manager1.address, fundBytecode)
    const savedFundAddress = await factory.connect(manager1).getFundByManager(manager1.address)
    expect(savedFundAddress).to.equal(expectedFundAddress)
    fund1Address = savedFundAddress
    fund1 = await ethers.getContractAt("XXXFund2", fund1Address)
  })

  it("create 2nd fund", async function () {
    await factory.connect(manager2).createFund()
    const fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
    const expectedFundAddress = getCreate2Address(factoryContractAddress, manager2.address, fundBytecode)
    const savedFundAddress = await factory.connect(manager2).getFundByManager(manager2.address)
    expect(savedFundAddress).to.equal(expectedFundAddress)
    fund2Address = savedFundAddress
    fund2 = await ethers.getContractAt("XXXFund2", fund2Address)
  })

  describe('sender : manager1', () => {

    it("getSwapRouterAddress()", async function () {
      expect(await factory.connect(manager1).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
    })

    it("getManagerFee()", async function () {
      expect(await factory.connect(manager1).getManagerFee()).to.equal(MANAGER_FEE)
    })

    it("isWhiteListToken()", async function () {
      expect(await factory.connect(manager1).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.be.true
    })

    it("getWhiteListTokens()", async function () {
      expect(await factory.connect(manager1).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
    })

    it("getFundByManager()", async function () {
      expect(await factory.connect(manager1).getFundByManager(manager1.address)).to.equal(fund1Address)
    })

    it("isSubscribed()", async function () {
      expect(await factory.connect(manager1).isSubscribed(manager1.address, fund1Address)).to.be.true
    })

    it("subscribedFunds()", async function () {
      expect(await factory.connect(manager1).subscribedFunds()).to.have.lengthOf(1)
    })

    it("subscribe()", async function () {
      await expect(factory.connect(manager1).subscribe(fund1Address)).to.be.reverted
    })

  })


  describe('sender : investor', () => {

    it("getSwapRouterAddress()", async function () {
      expect(await factory.connect(investor).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
    })

    it("getManagerFee()", async function () {
      expect(await factory.connect(investor).getManagerFee()).to.equal(MANAGER_FEE)
    })

    it("isWhiteListToken()", async function () {
      expect(await factory.connect(investor).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.be.true
    })

    it("getWhiteListTokens()", async function () {
      expect(await factory.connect(investor).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
    })

    it("getFundByManager() investor has no fund", async function () {
      expect(await factory.connect(investor).getFundByManager(investor.address)).to.equal(NULL_ADDRESS)
    })

    it("isSubscribed()", async function () {
      expect(await factory.connect(investor).isSubscribed(fund1Address,investor.address)).to.be.false
    })

    //investor is different from not investor at subscribe(), isSubscribed()
    it("subscribedFunds()", async function () {
      expect(await factory.connect(investor).subscribedFunds()).to.have.lengthOf(0)
    })

    it("not investor yet => isSubscribed()", async function () {
      expect(await factory.connect(investor).isSubscribed(investor.address, fund1Address)).to.be.false
    })

    it("register investor => subscribe()", async function () {
      await factory.connect(investor).subscribe(fund1Address)
    })

    it("check investor registered => isSubscribed()", async function () {
      const isRegistered = await factory.connect(investor).isSubscribed(investor.address, fund1Address)
      expect(isRegistered).to.be.true    
    })

    it("subscribedFunds()", async function () {
      expect(await factory.connect(investor).subscribedFunds()).to.have.lengthOf(1)
    })

    it("subscribe() must be fail : duplicate", async function () {
      await expect(factory.connect(investor).subscribe(fund1Address)).to.be.reverted
    })

  })

  describe('sender : not investor', () => {

    it("getSwapRouterAddress()", async function () {
      expect(await factory.connect(notInvestor).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
    })

    it("getManagerFee()", async function () {
      expect(await factory.connect(notInvestor).getManagerFee()).to.equal(MANAGER_FEE)
    })

    it("isWhiteListToken()", async function () {
      expect(await factory.connect(notInvestor).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.be.true
    })

    it("getWhiteListTokens()", async function () {
      expect(await factory.connect(notInvestor).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
    })

    it("getFundByManager()", async function () {
      expect(await factory.connect(notInvestor).getFundByManager(notInvestor.address)).to.equal(NULL_ADDRESS)
    })

    it("isSubscribed()", async function () {
      expect(await factory.connect(notInvestor).isSubscribed(fund1Address,notInvestor.address)).to.be.false
    })

    it("subscribedFunds()", async function () {
      expect(await factory.connect(notInvestor).subscribedFunds()).to.be.empty
    })

    it("subscribe()", async function () {
      await factory.connect(notInvestor).subscribe(fund1Address)
    })
  })
})