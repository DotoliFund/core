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


describe('WhiteListToken', () => {

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

  describe("white list token test", async function () {

    it("can't reset weth9 or dotoli from WhiteListToken", async function () {
      await expect(setting.connect(deployer).resetWhiteListToken(WETH9)).to.be.reverted
      await expect(setting.connect(deployer).resetWhiteListToken(DOTOLI)).to.be.reverted
    })

    it("can't set already white list token", async function () {
      await expect(setting.connect(deployer).setWhiteListToken(UNI)).to.be.reverted
    })

    it("can't reset not white list token ", async function () {
      await expect(setting.connect(deployer).resetWhiteListToken(USDC)).to.be.reverted
    })

    it("success setting white list token when more than minPoolAmount ", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.true

      await setting.connect(deployer).resetWhiteListToken(UNI)

      isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      await setting.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("100.0"))
      await setting.connect(deployer).setWhiteListToken(UNI)

      isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.true
    })

    it("fail setting white list token when less than minPoolAmount ", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.true

      await setting.connect(deployer).resetWhiteListToken(UNI)

      isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      await setting.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("1000000.0"))
      await expect(setting.connect(deployer).setWhiteListToken(UNI)).to.be.reverted

      isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      await setting.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("1000.0"))
      await setting.connect(deployer).setWhiteListToken(UNI)

      isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.true
    })

    it("fail deposit when not white list token", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.true

      await setting.connect(deployer).resetWhiteListToken(UNI)

      isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      const fund2Before = await getFundAccount(fundId2)
      const manager2Before = await getInvestorAccount(fundId2, manager2.address)

      await uni.connect(manager2).approve(fundAddress, constants.MaxUint256)
      await expect(fund.connect(manager2).deposit(fundId1, UNI, 100000)).to.be.reverted
    })

    it("success withdraw when not white list token", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)
      const manager2Before = await getInvestorAccount(fundId2, manager2.address)

      const withdraw_amount = ethers.utils.parseEther("0.000000000000001")
      await fund.connect(manager1).withdraw(fundId2, UNI, withdraw_amount)
      const fee = withdraw_amount.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = withdraw_amount.sub(fee)

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.sub(withdraw_amount))
      expect(manager2After.feeTokens[1][0]).to.equal(UNI) // tokenAddress
      expect(manager2After.feeTokens[1][1]).to.equal(manager2Before.feeTokens[1][1].add(fee)) // amount
      expect(fund2After.UNI).to.equal(fund2Before.UNI.sub(investorWithdrawAmount))
    })

    it("success fee out when not white list token", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      const manager2Before = await getInvestorAccount(fundId2, manager2.address)
      const feeTokens = await info.connect(manager2).getFeeTokens(fundId2)
      await fund.connect(manager2).withdrawFee(fundId2, UNI, 100000)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager2After.UNI).to.equal(manager2Before.UNI.add(100000))
    })

    it("success swap in when not white list token", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      const swapInputAmount = BigNumber.from(10000)
      const amountOutMinimum = BigNumber.from(1)

      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)

      //swap
      const params = exactInputSingleParams(
        UNI,
        WETH9, 
        swapInputAmount, 
        amountOutMinimum, 
        BigNumber.from(0)
      )
      await fund.connect(manager2).swap(fundId2, manager1.address, params, { value: 0 })

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)

      expect(fund2After.UNI).to.equal(fund2Before.UNI.sub(swapInputAmount))
      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.sub(swapInputAmount))
    })

    it("fail swap out when not white list token", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      const swapInputAmount = BigNumber.from(10000)
      const amountOutMinimum = BigNumber.from(1)

      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)

      //swap
      const params = exactInputSingleParams(
        WETH9,
        UNI, 
        swapInputAmount, 
        amountOutMinimum, 
        BigNumber.from(0)
      )
      await expect(fund.connect(manager2).swap(fundId2, manager1.address, params, { value: 0 })).to.be.reverted
    })

    it("fail mint position when not white list token", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      const params = mintParams(
        WETH9,
        UNI,
        FeeAmount.MEDIUM,
        getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        BigNumber.from(20000),
        BigNumber.from(100),
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await expect(fund.connect(manager2).mintNewPosition(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("fail increase liquidity when not white list token", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
      const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
      const params = increaseParams(
        tokenIds[0],
        BigNumber.from(20000),
        BigNumber.from(100),
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await expect(fund.connect(manager2).increaseLiquidity(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("success collect fee from liquidity when not white list token", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )
      await fund.connect(manager2).collectPositionFee(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )
    })

    it("success decrease liquidity when not white list token", async function () {
      let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
      expect(isUNIWhiteListToken).to.be.false

      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await fund.connect(manager2).decreaseLiquidity(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )
    })

    it("success add other token to white list token when more than min weth volume", async function () {
      const gitcoin = '0xDe30da39c46104798bB5aA3fe8B9e0e1F348163F'
      const livepeer = '0x58b6A8A3302369DAEc383334672404Ee733aB239'
      const theGraph = '0xc944E90C64B2c07662A292be6244BDf05Cda44a7'

      let isWBTCWLT = await setting.connect(manager1).whiteListTokens(WBTC)
      expect(isWBTCWLT).to.be.false
      let isUSDCWLT = await setting.connect(manager1).whiteListTokens(USDC)
      expect(isUSDCWLT).to.be.false
      let isDAIWLT = await setting.connect(manager1).whiteListTokens(DAI)
      expect(isDAIWLT).to.be.false
      let isGitcoinWLT = await setting.connect(manager1).whiteListTokens(gitcoin)
      expect(isGitcoinWLT).to.be.false
      let isLivepeerWLT = await setting.connect(manager1).whiteListTokens(livepeer)
      expect(isLivepeerWLT).to.be.false
      let isTheGraphWLT = await setting.connect(manager1).whiteListTokens(theGraph)
      expect(isTheGraphWLT).to.be.false

      await setting.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("10.0"))
      
      console.log('WBTC')
      await setting.connect(deployer).setWhiteListToken(WBTC)
      console.log('USDC')
      await setting.connect(deployer).setWhiteListToken(USDC)
      console.log('DAI')
      await setting.connect(deployer).setWhiteListToken(DAI)
      console.log('GTC')
      await setting.connect(deployer).setWhiteListToken(gitcoin)
      console.log('LPT')
      await setting.connect(deployer).setWhiteListToken(livepeer)
      console.log('GRT')
      await setting.connect(deployer).setWhiteListToken(theGraph)

      await setting.connect(deployer).resetWhiteListToken(WBTC)
      await setting.connect(deployer).resetWhiteListToken(USDC)
      await setting.connect(deployer).resetWhiteListToken(DAI)
      await setting.connect(deployer).resetWhiteListToken(gitcoin)
      await setting.connect(deployer).resetWhiteListToken(livepeer)
      await setting.connect(deployer).resetWhiteListToken(theGraph)
    })

    it("fail add other token to white list token when less than min weth volume", async function () {
      await setting.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("1000000.0"))

      const curve = '0xD533a949740bb3306d119CC777fa900bA034cd52'
      const maker = '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2'
      const compound = '0xc00e94Cb662C3520282E6f5717214004A7f26888'
      const enjin = '0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c'
      const shiba = '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE'
      const sushi = '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2'
      const sand = '0x3845badAde8e6dFF049820680d1F14bD3903a5d0'
      const yearn = '0x3845badAde8e6dFF049820680d1F14bD3903a5d0'
      const gitcoin = '0xDe30da39c46104798bB5aA3fe8B9e0e1F348163F'
      const livepeer = '0x58b6A8A3302369DAEc383334672404Ee733aB239'
      const theGraph = '0xc944E90C64B2c07662A292be6244BDf05Cda44a7'
      const matic = '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0'
      const audio = '0x18aAA7115705e8be94bfFEBDE57Af9BFc265B998'
      const near = '0x85F17Cf997934a597031b2E18a9aB6ebD4B9f6a4'
      const link = '0x514910771AF9Ca656af840dff83E8264EcF986CA'
      const bat = '0x0D8775F648430679A709E98d2b0Cb6250d2887EF'
      const ocean = '0x967da4048cD07aB37855c090aAF366e4ce1b9F48'

      let isWBTCWLT = await setting.connect(manager1).whiteListTokens(WBTC)
      expect(isWBTCWLT).to.be.false
      let isUSDCWLT = await setting.connect(manager1).whiteListTokens(USDC)
      expect(isUSDCWLT).to.be.false
      let isDAIWLT = await setting.connect(manager1).whiteListTokens(DAI)
      expect(isDAIWLT).to.be.false
      let isGitcoinWLT = await setting.connect(manager1).whiteListTokens(gitcoin)
      expect(isGitcoinWLT).to.be.false
      let isLivepeerWLT = await setting.connect(manager1).whiteListTokens(livepeer)
      expect(isLivepeerWLT).to.be.false
      let isTheGraphWLT = await setting.connect(manager1).whiteListTokens(theGraph)
      expect(isTheGraphWLT).to.be.false
      let isMaticWLT = await setting.connect(manager1).whiteListTokens(matic)
      expect(isMaticWLT).to.be.false
      let isAudioWLT = await setting.connect(manager1).whiteListTokens(audio)
      expect(isAudioWLT).to.be.false
      let isNearWLT = await setting.connect(manager1).whiteListTokens(near)
      expect(isNearWLT).to.be.false
      let isLinkWLT = await setting.connect(manager1).whiteListTokens(link)
      expect(isLinkWLT).to.be.false
      let isBatWLT = await setting.connect(manager1).whiteListTokens(bat)
      expect(isBatWLT).to.be.false
      let isOceanWLT = await setting.connect(manager1).whiteListTokens(ocean)
      expect(isOceanWLT).to.be.false

      console.log('WBTC')
      await expect(setting.connect(deployer).setWhiteListToken(WBTC)).to.be.reverted
      console.log('USDC')
      await expect(setting.connect(deployer).setWhiteListToken(USDC)).to.be.reverted
      console.log('DAI')
      await expect(setting.connect(deployer).setWhiteListToken(DAI)).to.be.reverted
      console.log('GTC')
      await expect(setting.connect(deployer).setWhiteListToken(gitcoin)).to.be.reverted
      console.log('LPT')
      await expect(setting.connect(deployer).setWhiteListToken(livepeer)).to.be.reverted
      console.log('GRT')
      await expect(setting.connect(deployer).setWhiteListToken(theGraph)).to.be.reverted
      console.log('MATIC')
      await expect(setting.connect(deployer).setWhiteListToken(matic)).to.be.reverted
      console.log('AUDIO')
      await expect(setting.connect(deployer).setWhiteListToken(audio)).to.be.reverted
      console.log('NEAR')
      await expect(setting.connect(deployer).setWhiteListToken(near)).to.be.reverted
      console.log('LINK')
      await expect(setting.connect(deployer).setWhiteListToken(link)).to.be.reverted
      console.log('BAT')
      await expect(setting.connect(deployer).setWhiteListToken(bat)).to.be.reverted
      console.log('OCEAN')
      await expect(setting.connect(deployer).setWhiteListToken(ocean)).to.be.reverted
    })
  })
})