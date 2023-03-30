import { Wallet, BigNumber, Contract } from 'ethers'
import { expect } from "chai"
import { ethers } from 'hardhat'
import { 
  DOTOLI,
  WETH9,
  UNI,
  UNISWAP_V3_FACTORY,
  NonfungiblePositionManager
} from "./shared/constants"


describe('DotoliInfo', () => {

  let deployer: Wallet 
  let manager1: Wallet
  let manager2: Wallet
  let investor1: Wallet
  let investor2: Wallet
  let notInvestor: Wallet

  let oracleAddress: string
  let settingAddress: string
  let infoAddress: string
  let fundAddress: string

  let oracle: Contract
  let setting: Contract
  let info: Contract
  let fund: Contract
  let weth9: Contract
  let uni: Contract
  let nonfungiblePositionManager: Contract

  let fundId1: BigNumber
  let fundId2: BigNumber

  let getFundAccount: (
    fundId: BigNumber
  ) => Promise<{
    WETH: BigNumber,
    UNI: BigNumber,
    feeTokens : string[],
  }>

  let getInvestorAccount: (
    fundId: BigNumber,
    who: string
  ) => Promise<{
    WETH: BigNumber,
    UNI: BigNumber,
    fundWETH: BigNumber,
    fundUNI: BigNumber,
  }>

  before('get signer', async () => {
    [ deployer,
      manager1,
      manager2,
      investor1,
      investor2,
      notInvestor
    ] = await (ethers as any).getSigners()

    weth9 = await ethers.getContractAt("@uniswap/v3-periphery/contracts/interfaces/external/IWETH9.sol:IWETH9", WETH9)
    uni = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", UNI)
    nonfungiblePositionManager = await ethers.getContractAt("@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol:INonfungiblePositionManager", NonfungiblePositionManager)

    getInvestorAccount = async (fundId: BigNumber, who: string) => {
      const balances = await Promise.all([
        weth9.balanceOf(who),
        uni.balanceOf(who),
        info.connect(who).getInvestorTokenAmount(fundId, who, WETH9),
        info.connect(who).getInvestorTokenAmount(fundId, who, UNI),
      ])
      return {
        WETH: balances[0],
        UNI: balances[1],
        fundWETH: balances[2],
        fundUNI: balances[3],
      }
    }

    getFundAccount = async (fundId: BigNumber) => {
      const balances = await Promise.all([
        info.connect(notInvestor).getFundTokenAmount(fundId, WETH9),
        info.connect(notInvestor).getFundTokenAmount(fundId, UNI),
        info.connect(notInvestor).getFeeTokens(fundId),
      ])
      return {
        WETH: balances[0],
        UNI: balances[1],
        feeTokens: balances[2],
      }
    }
  })

  before("Deploy LiquidityOracle Contract", async function () {
    const LiquidityOracle = await ethers.getContractFactory("LiquidityOracle")
    const Oracle = await LiquidityOracle.connect(deployer).deploy(
      UNISWAP_V3_FACTORY,
      NonfungiblePositionManager
    )
    await Oracle.deployed()
    oracleAddress = Oracle.address
    oracle = await ethers.getContractAt("LiquidityOracle", oracleAddress)
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


  describe('createFund', () => {

    it("createFund -> cannot multiple fund", async function () {
      await info.connect(investor1).createFund()
      await expect(info.connect(investor1).createFund()).to.be.revertedWith('EXIST')
      await expect(info.connect(manager1).createFund()).to.be.revertedWith('EXIST')
      await expect(info.connect(manager2).createFund()).to.be.revertedWith('EXIST')
    })

    it("invalid case", async function () {

    })

  })


  describe('subscribe', () => {

    it("subscribe -> cannot multiple subscribe", async function () {
      await info.connect(investor1).subscribe(fundId1)
      await expect(info.connect(investor1).subscribe(fundId1)).to.be.revertedWith('EXIST')
      await expect(info.connect(manager1).subscribe(fundId1)).to.be.revertedWith('EXIST')
      await info.connect(manager2).subscribe(fundId1)
    })

    it("invalid parameter", async function () {

    })

  })

  describe('addTokenId', () => {

    it("addTokenId -> only owner", async function () {
      await expect(info.connect(deployer).addTokenId(fundId1, deployer.address, 1000)).to.be.revertedWith('NO')
      await expect(info.connect(investor1).addTokenId(fundId1, investor1.address, 1000)).to.be.revertedWith('NO')
      await expect(info.connect(manager1).addTokenId(fundId1, manager1.address, 1000)).to.be.revertedWith('NO')
      await expect(info.connect(manager2).addTokenId(fundId1, manager2.address, 1000)).to.be.revertedWith('NO')
    })

    it("tested in swap.ts", async function () {

    })

  })

  describe('increaseFundToken', () => {

    it("increaseFundToken -> only owner", async function () {
      await expect(info.connect(deployer).increaseFundToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(investor1).increaseFundToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(manager1).increaseFundToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(manager2).increaseFundToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
    })

    it("tested in DotoliFund.ts, swap.ts, liquidity.ts", async function () {

    })

  })

  describe('decreaseFundToken', () => {

    it("decreaseFundToken -> only owner", async function () {
      await expect(info.connect(deployer).increaseFundToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(investor1).increaseFundToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(manager1).increaseFundToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(manager2).increaseFundToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')

    })

    it("tested in DotoliFund.ts, swap.ts, liquidity.ts", async function () {

    })

  })

  describe('increaseInvestorToken', () => {

    it("increaseInvestorToken -> only owner", async function () {
      await expect(info.connect(deployer).increaseInvestorToken(fundId1, deployer.address, WETH9, 10000))
        .to.be.revertedWith('NO')
      await expect(info.connect(investor1).increaseInvestorToken(fundId1, investor1.address, WETH9, 10000))
        .to.be.revertedWith('NO')
      await expect(info.connect(manager1).increaseInvestorToken(fundId1, manager1.address, WETH9, 10000))
        .to.be.revertedWith('NO')
      await expect(info.connect(manager2).increaseInvestorToken(fundId1, manager2.address, WETH9, 10000))
        .to.be.revertedWith('NO')
    })

    it("tested in DotoliFund.ts, swap.ts, liquidity.ts", async function () {

    })

  })

  describe('decreaseInvestorToken', () => {

    it("decreaseInvestorToken -> only owner", async function () {
      await expect(info.connect(deployer).decreaseInvestorToken(fundId1, deployer.address, WETH9, 10000))
        .to.be.revertedWith('NO')
      await expect(info.connect(investor1).decreaseInvestorToken(fundId1, investor1.address, WETH9, 10000))
        .to.be.revertedWith('NO')
      await expect(info.connect(manager1).decreaseInvestorToken(fundId1, manager1.address, WETH9, 10000))
        .to.be.revertedWith('NO')
      await expect(info.connect(manager2).decreaseInvestorToken(fundId1, manager2.address, WETH9, 10000))
        .to.be.revertedWith('NO')
    })

    it("tested in DotoliFund.ts, swap.ts, liquidity.ts", async function () {

    })

  })

  describe('increaseFeeToken', () => {

    it("increaseFeeToken -> only owner", async function () {
      await expect(info.connect(deployer).increaseFeeToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(investor1).increaseFeeToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(manager1).increaseFeeToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(manager2).increaseFeeToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')

    })

    it("tested in swap.ts", async function () {

    })

  })

  describe('decreaseFeeToken', () => {

    it("decreaseFeeToken -> only owner", async function () {
      await expect(info.connect(deployer).decreaseFeeToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(investor1).decreaseFeeToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(manager1).decreaseFeeToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
      await expect(info.connect(manager2).decreaseFeeToken(fundId1, WETH9, 10000)).to.be.revertedWith('NO')
    })

    it("tested in swap.ts", async function () {

    })

  })

})