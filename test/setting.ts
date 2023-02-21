import { Wallet, constants, BigNumber, Contract } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { DotoliSetting } from '../typechain-types/contracts/DotoliSetting'
import { DotoliInfo } from '../typechain-types/contracts/DotoliInfo'
import { DotoliFund } from '../typechain-types/contracts/DotoliFund'

import { 
  NULL_ADDRESS,
  DOTOLI,
  WETH9,
  USDC,
  UNI,
  DAI,
  V3_SWAP_ROUTER_ADDRESS,
  UNISWAP_V3_FACTORY,
  NonfungiblePositionManager,
  MANAGER_FEE,
  WHITE_LIST_TOKENS,
} from "./shared/constants"


describe('Setting', () => {

  let deployer: Wallet 
  let manager1: Wallet
  let manager2: Wallet
  let investor: Wallet
  let investor2: Wallet
  let noInvestor: Wallet

  let settingAddress: string
  let infoAddress: string
  let fundAddress: string

  let setting: Contract
  let info: Contract
  let fund: Contract

  let fundId1: string
  let fundId2: string
  
  before('get signer', async () => {
    [ deployer, 
      manager1, 
      manager2, 
      investor, 
      investor2,
      noInvestor
    ] = await (ethers as any).getSigners()
  })

  before("Deploy DotoliSetting Contract", async function () {
    const DotoliSetting = await ethers.getContractFactory("DotoliSetting")
    const Setting = await DotoliSetting.connect(deployer).deploy(DOTOLI, WETH9)
    await Setting.deployed()
    settingAddress = Setting.address
    setting = await ethers.getContractAt("DotoliSetting", settingAddress)
  })

  before("Deploy DotoliInfo Contract", async function () {
    const DotoliInfo = await ethers.getContractFactory("DotoliInfo")
    const Info = await DotoliInfo.connect(deployer).deploy()
    await Info.deployed()
    infoAddress = Info.address
    info = await ethers.getContractAt("DotoliInfo", infoAddress)
  })

  before("Deploy DotoliFund Contract", async function () {
    const DotoliFund = await ethers.getContractFactory("DotoliFund")
    const Fund = await DotoliFund.connect(deployer).deploy(WETH9, settingAddress, infoAddress)
    await Fund.deployed()
    fundAddress = Fund.address
    fund = await ethers.getContractAt("DotoliFund", fundAddress)
  })

  before("Set Owner DotoliInfo Contract", async function () {
    await info.connect(deployer).setOwner(fundAddress)
  })

  it("check DotoliInfo's owner is DotoliFund", async function () {
    const owner = await info.connect(manager1).owner()
    expect(owner).to.equal(fundAddress)
  })

  it("create 1st fund", async function () {
    await info.connect(manager1).createFund()
    const savedFundId = await info.connect(manager1).managingFund(manager1.address)
    expect(savedFundId).to.equal(BigNumber.from(1))
    fundId1 = savedFundId

    const fundIdCount = await info.connect(manager1).fundIdCount()
    expect(fundIdCount).to.equal(BigNumber.from(1))
  })

  it("create 2nd fund", async function () {
    await info.connect(manager2).createFund()
    const savedFundId = await info.connect(manager2).managingFund(manager2.address)
    expect(savedFundId).to.equal(BigNumber.from(2))
    fundId2 = savedFundId

    const fundIdCount = await info.connect(manager1).fundIdCount()
    expect(fundIdCount).to.equal(BigNumber.from(2))
  })

  describe('manager1', () => {

    it("manager is managing fund1", async function () {
      expect(await info.connect(manager1).managingFund(manager1.address)).to.be.above(0)
    })

    it("check manager is subscribed to fund1", async function () {
      expect(await info.connect(manager1).isSubscribed(manager1.address, fundId1)).to.be.true
    })

    it("manager's subscribed fund count is 1", async function () {
      expect(await info.connect(manager1).subscribedFunds(manager1.address)).to.have.lengthOf(1)
    })

    it("duplicated subscribe must be failed", async function () {
      await expect(info.connect(manager1).subscribe(fundId1)).to.be.reverted
    })

    it("cheak UNI is not white list token", async function () {
      expect(await setting.connect(manager1).whiteListTokens(UNI)).to.be.false
    })

    it("set UNI to white list token", async function () {
      await expect(setting.connect(deployer).setWhiteListToken(UNI))
    })

    it("cheak UNI is white list token", async function () {
      expect(await setting.connect(manager1).whiteListTokens(UNI)).to.be.true
    })

    it("cheak USDC is not white list token", async function () {
      expect(await setting.connect(manager1).whiteListTokens(USDC)).to.be.false
    })

    it("set USDC to white list token", async function () {
      await expect(setting.connect(deployer).setWhiteListToken(USDC))
    })

    it("cheak USDC is white list token", async function () {
      expect(await setting.connect(manager1).whiteListTokens(USDC)).to.be.true
    })

    it("cheak manager fee is 1", async function () {
      expect(await setting.connect(manager1).managerFee()).to.equal(10000)
    })

    it("set manager fee to 2", async function () {
      expect(await setting.connect(deployer).setManagerFee(20000))
    })

    it("cheak manager fee is 2", async function () {
      expect(await setting.connect(manager1).managerFee()).to.equal(20000)
    })

    // min WETH Volume which is for check white list token
    it("check minPoolAmount  is 1e18", async function () {
      const parseEther1 = ethers.utils.parseEther("1.0")
      expect(await setting.connect(manager1).minPoolAmount()).to.equal(parseEther1)
    })

    it("set minPoolAmount is 2e18", async function () {
      const parseEther2 = ethers.utils.parseEther("2.0")
      expect(await setting.connect(deployer).setMinPoolAmount(parseEther2))
    })

    it("check minPoolAmount is 2e18", async function () {
      const parseEther2 = ethers.utils.parseEther("2.0")
      expect(await setting.connect(manager1).minPoolAmount()).to.equal(parseEther2)
    })
  })


  describe('investor', () => {

    it("investor has no fund", async function () {
      expect(await info.connect(investor).managingFund(investor.address)).to.equal(0)
    })

    it("investor's subscribed fund count is 0", async function () {
      expect(await info.connect(investor).subscribedFunds(investor.address)).to.have.lengthOf(0)
    })

    it("check investor not subscribed to fund1", async function () {
      expect(await info.connect(investor).isSubscribed(investor.address, fundId1)).to.be.false
    })

    it("investor subscribe to fund1", async function () {
      await info.connect(investor).subscribe(fundId1)
    })

    it("check investor subscribed to fund1", async function () {
      expect(await info.connect(investor).isSubscribed(investor.address, fundId1)).to.be.true
    })

    it("investor's subscribed fund count is 1", async function () {
      expect(await info.connect(investor).subscribedFunds(investor.address)).to.have.lengthOf(1)
    })

    it("duplicated subscribe must be failed", async function () {
      await expect(info.connect(investor).subscribe(fundId1)).to.be.reverted
    })

    it("investor2 subscribe to fund1", async function () {
      await info.connect(investor2).subscribe(fundId1)
    })

    it("investor2's subscribed fund count is 1", async function () {
      expect(await info.connect(investor2).subscribedFunds(investor2.address)).to.have.lengthOf(1)
    })
  })

  describe('no investor', () => {

    it("noInvestor has no fund", async function () {
      expect(await info.connect(noInvestor).managingFund(noInvestor.address)).to.equal(0)
    })

    it("investor not registered to fund1", async function () {
      expect(await info.connect(noInvestor).isSubscribed(noInvestor.address, fundId1)).to.be.false
    })

    it("noInvestor's subscribed fund count is 0", async function () {
      expect(await info.connect(noInvestor).subscribedFunds(noInvestor.address)).to.be.empty
    })

    it("noInvestor subscribe to fund1", async function () {
      await info.connect(noInvestor).subscribe(fundId1)
    })

    it("check noInvestor subscribed to fund1", async function () {
      expect(await info.connect(investor).isSubscribed(investor.address, fundId1)).to.be.true
    })
  })
})