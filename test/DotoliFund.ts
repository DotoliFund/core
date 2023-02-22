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


describe('DotoliFund', () => {

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

    getInvestorAccount = async (fundId: BigNumber, who: string) => {
      const balances = await Promise.all([
        weth9.balanceOf(who),
        uni.balanceOf(who),
        info.connect(who).getInvestorTokenAmount(fundId, who, WETH9),
        info.connect(who).getInvestorTokenAmount(fundId, who, UNI),
      ])
      return {
        WETH9: balances[0],
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
        WETH9: balances[0],
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

  describe('fallback', () => {

    it("deposit ETH", async function () {
      await manager1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      await investor1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      await manager2.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      await expect(notInvestor.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })).to.be.revertedWith('US')
    })

    it("invalid case", async function () {

    })

  })

  describe('deposit', () => {

    it("deposit WETH", async function () {
      await fund.connect(manager1).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)
      await fund.connect(investor1).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)
      await fund.connect(manager2).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)

      await weth9.connect(manager2).approve(notInvestor.address, constants.MaxUint256)
      await uni.connect(manager2).approve(notInvestor.address, constants.MaxUint256)
      await weth9.connect(manager2).transfer(notInvestor.address, ethers.utils.parseEther("0.0001"))
      await uni.connect(manager2).transfer(notInvestor.address, ethers.utils.parseEther("0.0001"))

      await expect(fund.connect(notInvestor).deposit(fundId1, WETH9, ethers.utils.parseEther("0.00001")))
        .to.be.revertedWith('US')
    })

    it("deposit UNI", async function () {
      await fund.connect(manager1).deposit(fundId1, UNI, ethers.utils.parseEther("0.00001"))
      await fund.connect(investor1).deposit(fundId1, UNI, ethers.utils.parseEther("0.00001"))
      await fund.connect(manager2).deposit(fundId1, UNI, ethers.utils.parseEther("0.00001"))
      await expect(fund.connect(notInvestor).deposit(fundId1, UNI, ethers.utils.parseEther("0.00001")))
        .to.be.revertedWith('US')
    })

    it("invalid case", async function () {

    })

  })

  describe('withdraw', () => {

    it("withdraw WETH", async function () {
      await fund.connect(manager1).withdraw(fundId1, WETH9, ethers.utils.parseEther("0.00001"))
      await fund.connect(investor1).withdraw(fundId1, WETH9, ethers.utils.parseEther("0.00001"))
      await fund.connect(manager2).withdraw(fundId1, WETH9, ethers.utils.parseEther("0.00001"))
    })

    it("withdraw UNI", async function () {
      await fund.connect(manager1).withdraw(fundId1, UNI, ethers.utils.parseEther("0.00001"))
      await fund.connect(investor1).withdraw(fundId1, UNI, ethers.utils.parseEther("0.00001"))
      await fund.connect(manager2).withdraw(fundId1, UNI, ethers.utils.parseEther("0.00001"))
    })

    it("invalid case", async function () {

    })

  })

  describe('swap', () => {

    it("swap WETH -> UNI", async function () {
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = ethers.utils.parseEther("0.00001")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )

      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })
      await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })
      await fund.connect(manager1).swap(fundId1, manager2.address, params, { value: 0 })
    })

    it("swap UNI -> WETH", async function () {
      const tokens = [UNI, DAI, WETH9]
      const swapInputAmount = ethers.utils.parseEther("0.00001")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )

      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })
      await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })
      await fund.connect(manager1).swap(fundId1, manager2.address, params, { value: 0 })
    })

    it("invalid case", async function () {

    })

  })

  describe('withdrawFee', () => {

    it("withdrawFee WETH", async function () {
      await fund.connect(manager1).withdrawFee(fundId1, WETH9, 10000)
      await expect(fund.connect(investor1).withdrawFee(fundId1, WETH9, 10000)).to.be.revertedWith('NM')
      await expect(fund.connect(manager2).withdrawFee(fundId1, WETH9, 10000)).to.be.revertedWith('NM')
    })

    it("withdrawFee UNI", async function () {
      await fund.connect(manager1).withdrawFee(fundId1, UNI, 10000)
      await expect(fund.connect(investor1).withdrawFee(fundId1, UNI, 10000)).to.be.revertedWith('NM')
      await expect(fund.connect(manager2).withdrawFee(fundId1, UNI, 10000)).to.be.revertedWith('NM')
    })

  })

  describe('mintNewPosition', () => {

    it("mint WETH + UNI", async function () {
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

      await fund.connect(manager1).mintNewPosition(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )
      await fund.connect(manager1).mintNewPosition(
        fundId1,
        investor1.address,
        params, 
        { value: 0 }
      )
      await fund.connect(manager1).mintNewPosition(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )

      await expect(fund.connect(investor1).mintNewPosition(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
      await expect(fund.connect(investor1).mintNewPosition(
        fundId1,
        investor1.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
      await expect(fund.connect(investor1).mintNewPosition(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')

      await expect(fund.connect(manager2).mintNewPosition(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
      await expect(fund.connect(manager2).mintNewPosition(
        fundId1,
        investor1.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
      await expect(fund.connect(manager2).mintNewPosition(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')

    })

  })


  describe('increaseLiquidity', () => {

    it("increase liquidity WETH + UNI1", async function () {
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
      await expect(fund.connect(investor1).increaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
      await expect(fund.connect(manager2).increaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
    })

  })

  describe('collectPositionFee', () => {

    it("collect fee WETH + UNI", async function () {
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
      await fund.connect(investor1).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )
      await expect(fund.connect(manager2).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NA')
      
    })

  })

  describe('decreaseLiquidity', () => {

    it("decrease liquidity WETH + UNI1", async function () {
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
      await expect(fund.connect(investor1).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      ))
      await expect(fund.connect(manager2).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NA')
      
    })

  })

})