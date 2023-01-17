import { Wallet, constants, BigNumber, Contract } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { XXXFactory } from '../typechain-types/contracts/XXXFactory'
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2'
import { getCreate2Address } from './shared/utilities'

import { 
  NULL_ADDRESS,
  WETH9,
  USDC,
  UNI,
  DAI,
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
  let noInvestor: Wallet

  let factoryContractAddress: string
  let fundContractAddress: string

  let fund1Address: string
  let fund2Address: string

  let factory: Contract
  let fund1: Contract
  let fund2: Contract
  
  before('get signer', async () => {
    [ deployer, 
      manager1, 
      manager2, 
      investor, 
      investor2,
      noInvestor
    ] = await (ethers as any).getSigners()
  })

  before("Deploy XXXFactory Contract", async function () {
    const XXXFactory = await ethers.getContractFactory("XXXFactory")
    const Factory = await XXXFactory.connect(deployer).deploy(WETH9, DAI) //XXX is error so use DAI for just test
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

  describe('manager1', () => {

    it("manager is managing fund1", async function () {
      expect(await factory.connect(manager1).getFundByManager(manager1.address)).to.equal(fund1Address)
    })

    it("check manager is subscribed to fund1", async function () {
      expect(await factory.connect(manager1).isSubscribed(manager1.address, fund1Address)).to.be.true
    })

    it("manager's subscribed fund count is 1", async function () {
      expect(await factory.connect(manager1).subscribedFunds(manager1.address)).to.have.lengthOf(1)
    })

    it("duplicated subscribe must be failed", async function () {
      await expect(factory.connect(manager1).subscribe(fund1Address)).to.be.reverted
    })

    it("cheak UNI is not white list token", async function () {
      expect(await factory.connect(manager1).whiteListTokens(UNI)).to.be.false
    })

    it("set UNI to white list token", async function () {
      await expect(factory.connect(deployer).setWhiteListToken(UNI))
    })

    it("cheak UNI is white list token", async function () {
      expect(await factory.connect(manager1).whiteListTokens(UNI)).to.be.true
    })

    it("cheak USDC is not white list token", async function () {
      expect(await factory.connect(manager1).whiteListTokens(USDC)).to.be.false
    })

    it("set USDC to white list token", async function () {
      await expect(factory.connect(deployer).setWhiteListToken(USDC))
    })

    it("cheak USDC is white list token", async function () {
      expect(await factory.connect(manager1).whiteListTokens(USDC)).to.be.true
    })

    it("cheak manager fee is 1", async function () {
      expect(await factory.connect(manager1).managerFee()).to.equal(10000)
    })

    it("set manager fee to 2", async function () {
      expect(await factory.connect(deployer).setManagerFee(20000))
    })

    it("cheak manager fee is 2", async function () {
      expect(await factory.connect(manager1).managerFee()).to.equal(20000)
    })

    // min WETH Volume which is for check white list token
    it("check minPoolAmount  is 1e18", async function () {
      const parseEther1 = ethers.utils.parseEther("1.0")
      expect(await factory.connect(manager1).minPoolAmount()).to.equal(parseEther1)
    })

    it("set minPoolAmount is 2e18", async function () {
      const parseEther2 = ethers.utils.parseEther("2.0")
      expect(await factory.connect(deployer).setMinPoolAmount(parseEther2))
    })

    it("check minPoolAmount is 2e18", async function () {
      const parseEther2 = ethers.utils.parseEther("2.0")
      expect(await factory.connect(manager1).minPoolAmount()).to.equal(parseEther2)
    })
  })


  describe('investor', () => {

    it("investor has no fund", async function () {
      expect(await factory.connect(investor).getFundByManager(investor.address)).to.equal(NULL_ADDRESS)
    })

    it("investor's subscribed fund count is 0", async function () {
      expect(await factory.connect(investor).subscribedFunds(investor.address)).to.have.lengthOf(0)
    })

    it("check investor not subscribed to fund1", async function () {
      expect(await factory.connect(investor).isSubscribed(investor.address, fund1Address)).to.be.false
    })

    it("investor subscribe to fund1", async function () {
      await factory.connect(investor).subscribe(fund1Address)
    })

    it("check investor subscribed to fund1", async function () {
      expect(await factory.connect(investor).isSubscribed(investor.address, fund1Address)).to.be.true
    })

    it("investor's subscribed fund count is 1", async function () {
      expect(await factory.connect(investor).subscribedFunds(investor.address)).to.have.lengthOf(1)
    })

    it("duplicated subscribe must be failed", async function () {
      await expect(factory.connect(investor).subscribe(fund1Address)).to.be.reverted
    })

    it("investor2 subscribe to fund1", async function () {
      await factory.connect(investor2).subscribe(fund1Address)
    })

    it("investor2's subscribed fund count is 1", async function () {
      expect(await factory.connect(investor2).subscribedFunds(investor2.address)).to.have.lengthOf(1)
    })
  })

  describe('no investor', () => {

    it("noInvestor has no fund", async function () {
      expect(await factory.connect(noInvestor).getFundByManager(noInvestor.address)).to.equal(NULL_ADDRESS)
    })

    it("investor not registered to fund1", async function () {
      expect(await factory.connect(noInvestor).isSubscribed(fund1Address,noInvestor.address)).to.be.false
    })

    it("noInvestor's subscribed fund count is 0", async function () {
      expect(await factory.connect(noInvestor).subscribedFunds(noInvestor.address)).to.be.empty
    })

    it("noInvestor subscribe to fund1", async function () {
      await factory.connect(noInvestor).subscribe(fund1Address)
    })

    it("check noInvestor subscribed to fund1", async function () {
      expect(await factory.connect(investor).isSubscribed(investor.address, fund1Address)).to.be.true
    })
  })
})