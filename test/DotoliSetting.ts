import { Wallet, constants, BigNumber, ContractTransaction, Contract } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { LiquidityOracle } from '../typechain-types/contracts/LiquidityOracle'
import { DotoliSetting } from '../typechain-types/contracts/DotoliSetting'
import { DotoliInfo } from '../typechain-types/contracts/DotoliInfo'
import { DotoliFund } from '../typechain-types/contracts/DotoliFund'
import { encodePath } from './shared/path'
import { 
  exactInputSingleParams,
  exactOutputSingleParams,
  exactInputParams,
  exactOutputParams
} from './shared/swap'
import { 
  mintParams,
  increaseParams,
  collectParams,
  decreaseParams
} from './shared/liquidity'
import { 
  DOTOLI,
  WETH9,
  WBTC,
  USDC,
  UNI,
  DAI,
  DOTOLI,
  NULL_ADDRESS,
  V3_SWAP_ROUTER_ADDRESS,
  WETH_CHARGE_AMOUNT,
  DEPOSIT_AMOUNT,
  WITHDRAW_AMOUNT,
  MANAGER_FEE,
  WHITE_LIST_TOKENS,
  FeeAmount,
  MaxUint128,
  TICK_SPACINGS,
  UNISWAP_V3_FACTORY,
  NonfungiblePositionManager
} from "./shared/constants"
import { getMaxTick, getMinTick } from './shared/ticks'


describe('DotoliSetting', () => {

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
  }>

  let getInvestorAccount: (
    fundId: BigNumber,
    who: string
  ) => Promise<{
    weth9: BigNumber,
    uni: BigNumber,
    fundWETH: BigNumber,
    fundUNI: BigNumber,
    feeTokens : string[],
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

  describe('setOwner', () => {
    it("setOwner -> only owner", async function () {
      await setting.connect(deployer).setOwner(manager1.address)
      expect(await setting.connect(deployer).owner()).to.equal(manager1.address)
      await setting.connect(manager1).setOwner(deployer.address)
      await expect(setting.connect(manager1).setOwner(fundAddress)).to.be.revertedWith('NO')
      await expect(setting.connect(investor1).setOwner(fundAddress)).to.be.revertedWith('NO')
      await expect(setting.connect(notInvestor).setOwner(fundAddress)).to.be.revertedWith('NO')
    })
  })

  describe('setManagerFee', () => {
    it("setManagerFee -> only owner", async function () {
      await setting.connect(deployer).setManagerFee(20000)
      expect(await setting.connect(deployer).managerFee()).to.equal(20000)
      await expect(setting.connect(manager1).setManagerFee(20000)).to.be.revertedWith('NO')
      await expect(setting.connect(investor1).setManagerFee(20000)).to.be.revertedWith('NO')
      await expect(setting.connect(notInvestor).setManagerFee(20000)).to.be.revertedWith('NO')
    })
  })

  describe('setMinPoolAmount', () => {
    it("setMinPoolAmount -> only owner", async function () {
      const minPoolAmountt = ethers.utils.parseEther("2.0")
      await setting.connect(deployer).setMinPoolAmount(minPoolAmountt)
      expect(await setting.connect(deployer).minPoolAmount()).to.equal(minPoolAmountt)
      await expect(setting.connect(manager1).setMinPoolAmount(minPoolAmountt)).to.be.revertedWith('NO')
      await expect(setting.connect(investor1).setMinPoolAmount(minPoolAmountt)).to.be.revertedWith('NO')
      await expect(setting.connect(notInvestor).setMinPoolAmount(minPoolAmountt)).to.be.revertedWith('NO')
    })
  })

  describe('setWhiteListToken', () => {
    it("setWhiteListToken -> only owner", async function () {
      await setting.connect(deployer).setWhiteListToken(UNI)
      expect(await setting.connect(deployer).whiteListTokens(UNI)).to.be.true
      await expect(setting.connect(manager1).setWhiteListToken(UNI)).to.be.revertedWith('NO')
      await expect(setting.connect(investor1).setWhiteListToken(UNI)).to.be.revertedWith('NO')
      await expect(setting.connect(notInvestor).setWhiteListToken(UNI)).to.be.revertedWith('NO')
      await setting.connect(deployer).resetWhiteListToken(UNI)
    })

    it("REVERT : setWhiteListToken -> minPoolAmount (1000000.0)", async function () {
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
      // let isLinkWLT = await setting.connect(manager1).whiteListTokens(link)
      // expect(isLinkWLT).to.be.false
      // let isBatWLT = await setting.connect(manager1).whiteListTokens(bat)
      // expect(isBatWLT).to.be.false
      // let isOceanWLT = await setting.connect(manager1).whiteListTokens(ocean)
      // expect(isOceanWLT).to.be.false

      //console.log('WBTC')
      await expect(setting.connect(deployer).setWhiteListToken(WBTC)).to.be.revertedWith('CWLT')
      //console.log('USDC')
      await expect(setting.connect(deployer).setWhiteListToken(USDC)).to.be.revertedWith('CWLT')
      //console.log('DAI')
      await expect(setting.connect(deployer).setWhiteListToken(DAI)).to.be.revertedWith('CWLT')
      //console.log('GTC')
      await expect(setting.connect(deployer).setWhiteListToken(gitcoin)).to.be.revertedWith('CWLT')
      //console.log('LPT')
      await expect(setting.connect(deployer).setWhiteListToken(livepeer)).to.be.revertedWith('CWLT')
      //console.log('GRT')
      await expect(setting.connect(deployer).setWhiteListToken(theGraph)).to.be.revertedWith('CWLT')
      //console.log('MATIC')
      await expect(setting.connect(deployer).setWhiteListToken(matic)).to.be.revertedWith('CWLT')
      //console.log('AUDIO')
      await expect(setting.connect(deployer).setWhiteListToken(audio)).to.be.revertedWith('CWLT')
      //console.log('NEAR')
      await expect(setting.connect(deployer).setWhiteListToken(near)).to.be.revertedWith('CWLT')
      // console.log('LINK')
      // await expect(setting.connect(deployer).setWhiteListToken(link)).to.be.revertedWith('CWLT')
      // console.log('BAT')
      // await expect(setting.connect(deployer).setWhiteListToken(bat)).to.be.revertedWith('CWLT')
      // console.log('OCEAN')
      // await expect(setting.connect(deployer).setWhiteListToken(ocean)).to.be.revertedWith('CWLT')
    })

  })


  describe('resetWhiteListToken', () => {
    it("resetWhiteListToken -> only owner", async function () {
      expect(await setting.connect(deployer).whiteListTokens(UNI)).to.be.false
      await expect(setting.connect(manager1).resetWhiteListToken(UNI)).to.be.revertedWith('NO')
      await expect(setting.connect(investor1).resetWhiteListToken(UNI)).to.be.revertedWith('NO')
      await expect(setting.connect(notInvestor).resetWhiteListToken(UNI)).to.be.revertedWith('NO')
    })

    it("setWhiteListToken -> minPoolAmount (10.0)", async function () {
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
      
      //console.log('WBTC')
      await setting.connect(deployer).setWhiteListToken(WBTC)
      //console.log('USDC')
      await setting.connect(deployer).setWhiteListToken(USDC)
      //console.log('DAI')
      await setting.connect(deployer).setWhiteListToken(DAI)
      //console.log('GTC')
      await setting.connect(deployer).setWhiteListToken(gitcoin)
      //console.log('LPT')
      await setting.connect(deployer).setWhiteListToken(livepeer)
      //console.log('GRT')
      await setting.connect(deployer).setWhiteListToken(theGraph)

      await setting.connect(deployer).resetWhiteListToken(WBTC)
      await setting.connect(deployer).resetWhiteListToken(USDC)
      await setting.connect(deployer).resetWhiteListToken(DAI)
      await setting.connect(deployer).resetWhiteListToken(gitcoin)
      await setting.connect(deployer).resetWhiteListToken(livepeer)
      await setting.connect(deployer).resetWhiteListToken(theGraph)
    })

  })

  describe('subscribe to fund1', () => {
    it("investor1 subscribe -> fund1", async function () {
      await info.connect(investor1).subscribe(fundId1)
    })
    it("manager2 subscribe -> fund1", async function () {
      await info.connect(manager2).subscribe(fundId1)
    })
  })

  describe('charge fund account WETH, UNI', () => {

    it("setWhiteListToken -> UNI", async function () {
      await setting.connect(deployer).setWhiteListToken(UNI)
    })

    it("charge wallet -> manager1", async function () {
      await weth9.connect(manager1).approve(fundAddress, constants.MaxUint256)
      await uni.connect(manager1).approve(fundAddress, constants.MaxUint256)
      
      //deposit
      await manager1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      //swap WETH -> UNI
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = ethers.utils.parseEther("0.5")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      //withdraw
      await fund.connect(manager1).withdraw(fundId1, UNI, ethers.utils.parseEther("0.1"))

      await weth9.connect(manager1).deposit({
        from: manager1.address,
        value: WETH_CHARGE_AMOUNT
      })
    })
    it("charge wallet -> investor1", async function () {
      await weth9.connect(investor1).approve(fundAddress, constants.MaxUint256)
      await uni.connect(investor1).approve(fundAddress, constants.MaxUint256)
      
      //deposit
      await investor1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })     

      //swap WETH -> UNI
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = ethers.utils.parseEther("0.5")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })

      //withdraw
      await fund.connect(investor1).withdraw(fundId1, UNI, ethers.utils.parseEther("0.1"))

      await weth9.connect(investor1).deposit({
        from: investor1.address,
        value: WETH_CHARGE_AMOUNT
      })
    })
    it("charge wallet -> manager2", async function () {
      await weth9.connect(manager2).approve(fundAddress, constants.MaxUint256)
      await uni.connect(manager2).approve(fundAddress, constants.MaxUint256)
      
      //deposit
      await manager2.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      //swap WETH -> UNI
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = ethers.utils.parseEther("0.5")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await fund.connect(manager1).swap(fundId1, manager2.address, params, { value: 0 })

      //withdraw
      await fund.connect(manager2).withdraw(fundId1, UNI, ethers.utils.parseEther("0.1"))

      await weth9.connect(manager2).deposit({
        from: manager2.address,
        value: WETH_CHARGE_AMOUNT
      })
    })
    it("charge wallet -> notInvestor", async function () {
      // do nothing
    })
  })

  describe('if whiteListToken -> YES', () => {

    it("whiteListToken -> deposit UNI", async function () {
      await fund.connect(manager1).deposit(fundId1, UNI, 10000)
      await fund.connect(investor1).deposit(fundId1, UNI, 10000)
      await fund.connect(manager2).deposit(fundId1, UNI, 10000)
    })

    it("whiteListToken -> withdraw UNI", async function () {
      await fund.connect(manager1).withdraw(fundId1, UNI, 10000)
      await fund.connect(investor1).withdraw(fundId1, UNI, 10000)
      await fund.connect(manager2).withdraw(fundId1, UNI, 10000)
    })

    it("whiteListToken -> swap", async function () {
      //swap WETH -> UNI
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = ethers.utils.parseEther("0.0000001")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })

      //swap UNI -> WETH
      const tokens2 = [UNI, DAI, WETH9]
      const swapInputAmount2 = ethers.utils.parseEther("0.0000001")
      const amountOutMinimum2 = BigNumber.from(1)
      const params2 = exactInputParams(
        tokens2,
        swapInputAmount2,
        amountOutMinimum2
      )
      await fund.connect(manager1).swap(fundId1, investor1.address, params2, { value: 0 })
    })

    it("whiteListToken -> withdrawFee", async function () {
      await fund.connect(manager1).withdrawFee(fundId1, UNI, ethers.utils.parseEther("0.0000000001"))
    })

    it("whiteListToken -> mint", async function () {
      const params = mintParams(
        UNI,
        WETH9,
        FeeAmount.MEDIUM,
        getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        BigNumber.from(20000),
        BigNumber.from(100),
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await fund.connect(manager1).mintNewPosition(fundId1, investor1.address, params)
    })

    it("whiteListToken -> increase liquidity", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const params = increaseParams(
        tokenIds[0],
        BigNumber.from(20000),
        BigNumber.from(100),
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await fund.connect(manager1).increaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )
    })

    it("whiteListToken -> collect fee", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )
      await fund.connect(manager1).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )
    })

    it("whiteListToken -> decrease liquidity", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await fund.connect(manager1).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )
    })

    it("invalid case", async function () {

    })

  })


  describe('if whiteListToken -> NO', () => {

    it("resetWhiteListToken -> UNI", async function () {
      await setting.connect(deployer).resetWhiteListToken(UNI)
    })

    it("no whiteListToken -> deposit", async function () {
      await expect(fund.connect(manager1).deposit(fundId1, UNI, 10000)).to.be.revertedWith('NWT')
      await expect(fund.connect(investor1).deposit(fundId1, UNI, 10000)).to.be.revertedWith('NWT')
      await expect(fund.connect(manager2).deposit(fundId1, UNI, 10000)).to.be.revertedWith('NWT')
    })

    it("no whiteListToken -> withdraw", async function () {
      await fund.connect(manager1).withdraw(fundId1, UNI, 10000)
      await fund.connect(investor1).withdraw(fundId1, UNI, 10000)
      await fund.connect(manager2).withdraw(fundId1, UNI, 10000)
    })

    it("no whiteListToken -> swap", async function () {
      //swap WETH -> UNI
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = ethers.utils.parseEther("0.0000001")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await expect(fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 }))
        .to.be.revertedWith('NWT')

      //swap UNI -> WETH
      const tokens2 = [UNI, DAI, WETH9]
      const swapInputAmount2 = ethers.utils.parseEther("0.0000001")
      const amountOutMinimum2 = BigNumber.from(1)
      const params2 = exactInputParams(
        tokens2,
        swapInputAmount2,
        amountOutMinimum2
      )
      await fund.connect(manager1).swap(fundId1, investor1.address, params2, { value: 0 })
    })

    it("no whiteListToken -> withdrawFee", async function () {
      await fund.connect(manager1).withdrawFee(fundId1, UNI, ethers.utils.parseEther("0.0000000001"))
    })

    it("no whiteListToken -> mint", async function () {
      const params = mintParams(
        UNI,
        WETH9,
        FeeAmount.MEDIUM,
        getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        BigNumber.from(20000),
        BigNumber.from(100),
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await expect(fund.connect(manager1).mintNewPosition(fundId1, investor1.address, params))
        .to.be.revertedWith('NWT0')
    })

    it("no whiteListToken -> increase liquidity", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const params = increaseParams(
        tokenIds[0],
        BigNumber.from(20000),
        BigNumber.from(100),
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await expect(fund.connect(manager1).increaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NWT0')
    })

    it("no whiteListToken -> collect fee", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )
      await fund.connect(manager1).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )
    })

    it("no whiteListToken -> decrease liquidity", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await fund.connect(manager1).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )
    })

    it("invalid case", async function () {

    })

  })

})