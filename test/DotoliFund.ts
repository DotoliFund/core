import { Wallet, constants, BigNumber, Contract } from 'ethers'
import { expect } from "chai"
import { ethers } from 'hardhat'
import { 
  exactInputParams,
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
  UNI,
  DAI,
  WETH_CHARGE_AMOUNT,
  DEPOSIT_AMOUNT,
  MANAGER_FEE,
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

      //withdraw ETH, UNI
      await fund.connect(manager1).withdraw(fundId1, WETH9, ethers.utils.parseEther("0.1"))
      await fund.connect(manager1).withdraw(fundId1, UNI, ethers.utils.parseEther("0.1"))

      //get WETH in wallet
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

      //withdraw ETH, UNI
      await fund.connect(investor1).withdraw(fundId1, WETH9, ethers.utils.parseEther("0.1"))
      await fund.connect(investor1).withdraw(fundId1, UNI, ethers.utils.parseEther("0.1"))

      //get WETH in wallet
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

      //withdraw ETH, UNI
      await fund.connect(manager2).withdraw(fundId1, WETH9, ethers.utils.parseEther("0.1"))
      await fund.connect(manager2).withdraw(fundId1, UNI, ethers.utils.parseEther("0.1"))

      //get WETH in wallet
      await weth9.connect(manager2).deposit({
        from: manager2.address,
        value: WETH_CHARGE_AMOUNT
      })
    })
    it("charge wallet -> notInvestor", async function () {
      // do nothing
    })
  })

  describe('fallback -> Deposit ETH', () => {

    it("manager1 deposit ETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await manager1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH.add(DEPOSIT_AMOUNT))
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(DEPOSIT_AMOUNT))
    })

    it("investor1 deposit ETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await investor1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH.add(DEPOSIT_AMOUNT))
      expect(investor1After.fundWETH).to.equal(investor1Before.fundWETH.add(DEPOSIT_AMOUNT))
    })

    it("manager2 deposit ETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      await manager2.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      const fundAfter = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH.add(DEPOSIT_AMOUNT))
      expect(manager2After.fundWETH).to.equal(manager2Before.fundWETH.add(DEPOSIT_AMOUNT))
    })

    it("notInvestor deposit ETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const notInvestorBefore = await getInvestorAccount(fundId1, notInvestor.address)

      await expect(notInvestor.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })).to.be.revertedWith('US')

      const fundAfter = await getFundAccount(fundId1)
      const notInvestorAfter = await getInvestorAccount(fundId1, notInvestor.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH)
      expect(notInvestorAfter.fundWETH).to.equal(notInvestorBefore.fundWETH)
    })

    it("invalid case", async function () {

    })

  })

  describe('deposit -> WETH, UNI', () => {

    it("manager1 deposit WETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH.add(DEPOSIT_AMOUNT))
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(DEPOSIT_AMOUNT))
    })

    it("investor1 deposit WETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(investor1).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH.add(DEPOSIT_AMOUNT))
      expect(investor1After.fundWETH).to.equal(investor1Before.fundWETH.add(DEPOSIT_AMOUNT))
    })

    it("manager2 deposit WETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      await fund.connect(manager2).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)

      const fundAfter = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH.add(DEPOSIT_AMOUNT))
      expect(manager2After.fundWETH).to.equal(manager2Before.fundWETH.add(DEPOSIT_AMOUNT))
    })

    it("notInvestor deposit WETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const notInvestorBefore = await getInvestorAccount(fundId1, notInvestor.address)

      await weth9.connect(manager2).approve(notInvestor.address, constants.MaxUint256)
      await weth9.connect(manager2).transfer(notInvestor.address, ethers.utils.parseEther("0.0001"))

      await expect(fund.connect(notInvestor).deposit(fundId1, WETH9, ethers.utils.parseEther("0.00001")))
        .to.be.revertedWith('US')

      const fundAfter = await getFundAccount(fundId1)
      const notInvestorAfter = await getInvestorAccount(fundId1, notInvestor.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH)
      expect(notInvestorAfter.fundWETH).to.equal(notInvestorBefore.fundWETH)
    })

    it("manager1 deposit UNI", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const depositAmountUNI = ethers.utils.parseEther("0.00001")
      await fund.connect(manager1).deposit(fundId1, UNI, depositAmountUNI)

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fundAfter.UNI).to.equal(fundBefore.UNI.add(depositAmountUNI))
      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.add(depositAmountUNI))
    })

    it("investor1 deposit UNI", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      const depositAmountUNI = ethers.utils.parseEther("0.00001")
      await fund.connect(investor1).deposit(fundId1, UNI, depositAmountUNI)

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)

      expect(fundAfter.UNI).to.equal(fundBefore.UNI.add(depositAmountUNI))
      expect(investor1After.fundUNI).to.equal(investor1Before.fundUNI.add(depositAmountUNI))
    })

    it("manager2 deposit UNI", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      const depositAmountUNI = ethers.utils.parseEther("0.00001")
      await fund.connect(manager2).deposit(fundId1, UNI, depositAmountUNI)

      const fundAfter = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)

      expect(fundAfter.UNI).to.equal(fundBefore.UNI.add(depositAmountUNI))
      expect(manager2After.fundUNI).to.equal(manager2Before.fundUNI.add(depositAmountUNI))
    })

    it("notInvestor deposit UNI", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const notInvestorBefore = await getInvestorAccount(fundId1, notInvestor.address)

      const depositAmountUNI = ethers.utils.parseEther("0.00001")
      await uni.connect(manager2).approve(notInvestor.address, constants.MaxUint256)
      await uni.connect(manager2).transfer(notInvestor.address, ethers.utils.parseEther("0.0001"))

      await expect(fund.connect(notInvestor).deposit(fundId1, UNI, ethers.utils.parseEther("0.00001")))
        .to.be.revertedWith('US')

      const fundAfter = await getFundAccount(fundId1)
      const notInvestorAfter = await getInvestorAccount(fundId1, notInvestor.address)

      expect(fundAfter.UNI).to.equal(fundBefore.UNI)
      expect(notInvestorAfter.fundUNI).to.equal(notInvestorBefore.fundUNI)
    })

    it("invalid case", async function () {

    })

  })

  describe('withdraw -> WETH, UNI', () => {

    it("manager1 withdraw WETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const withdrawAmount = ethers.utils.parseEther("0.00001")
      await fund.connect(manager1).withdraw(fundId1, WETH9, withdrawAmount)

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH.sub(withdrawAmount))
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(withdrawAmount))
    })

    it("investor1 withdraw WETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      const withdrawAmount = ethers.utils.parseEther("0.00001")
      await fund.connect(investor1).withdraw(fundId1, WETH9, withdrawAmount)

      //withdraw fee
      const fee = withdrawAmount.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = withdrawAmount.sub(fee)

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)

      expect(investor1After.fundWETH).to.equal(investor1Before.fundWETH.sub(withdrawAmount))
      expect(fundAfter.WETH).to.equal(fundBefore.WETH.sub(investorWithdrawAmount))
      expect(fundAfter.feeTokens[0][0]).to.equal(WETH9)
      expect(fundAfter.feeTokens[0][1]).to.equal(fundBefore.feeTokens[0][1].add(fee))
    })

    it("manager2 withdraw WETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      const withdrawAmount = ethers.utils.parseEther("0.00001")
      await fund.connect(manager2).withdraw(fundId1, WETH9, withdrawAmount)

      //withdraw fee
      const fee = withdrawAmount.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = withdrawAmount.sub(fee)

      const fundAfter = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)

      expect(manager2After.fundWETH).to.equal(manager2Before.fundWETH.sub(withdrawAmount))
      expect(fundAfter.WETH).to.equal(fundBefore.WETH.sub(investorWithdrawAmount))
      expect(fundAfter.feeTokens[0][0]).to.equal(WETH9)
      expect(fundAfter.feeTokens[0][1]).to.equal(fundBefore.feeTokens[0][1].add(fee))
    })

    it("notInvestor withdraw WETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const notInvestorBefore = await getInvestorAccount(fundId1, notInvestor.address)

      const withdrawAmount = ethers.utils.parseEther("0.00001")
      await weth9.connect(manager2).approve(notInvestor.address, constants.MaxUint256)
      await weth9.connect(manager2).transfer(notInvestor.address, ethers.utils.parseEther("0.0001"))

      await expect(fund.connect(notInvestor).withdraw(fundId1, WETH9, withdrawAmount))
        .to.be.revertedWith('US')

      const fundAfter = await getFundAccount(fundId1)
      const notInvestorAfter = await getInvestorAccount(fundId1, notInvestor.address)

      expect(fundAfter.WETH).to.equal(fundBefore.WETH)
      expect(notInvestorAfter.fundWETH).to.equal(notInvestorBefore.fundWETH)
    })

    it("manager1 withdraw UNI", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const withdrawAmount = ethers.utils.parseEther("0.00001")
      await fund.connect(manager1).withdraw(fundId1, UNI, withdrawAmount)

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fundAfter.UNI).to.equal(fundBefore.UNI.sub(withdrawAmount))
      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.sub(withdrawAmount))
    })

    it("investor1 withdraw UNI", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      const withdrawAmount = ethers.utils.parseEther("0.00001")
      await fund.connect(investor1).withdraw(fundId1, UNI, withdrawAmount)

      //withdraw fee
      const fee = withdrawAmount.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = withdrawAmount.sub(fee)

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)

      expect(investor1After.fundUNI).to.equal(investor1Before.fundUNI.sub(withdrawAmount))
      expect(fundAfter.UNI).to.equal(fundBefore.UNI.sub(investorWithdrawAmount))
      expect(fundAfter.feeTokens[1][0]).to.equal(UNI)
      expect(fundAfter.feeTokens[1][1]).to.equal(fundBefore.feeTokens[1][1].add(fee))
    })

    it("manager2 withdraw UNI", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      const withdrawAmount = ethers.utils.parseEther("0.00001")
      await fund.connect(manager2).withdraw(fundId1, UNI, withdrawAmount)

      //withdraw fee
      const fee = withdrawAmount.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = withdrawAmount.sub(fee)

      const fundAfter = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)

      expect(manager2After.fundUNI).to.equal(manager2Before.fundUNI.sub(withdrawAmount))
      expect(fundAfter.UNI).to.equal(fundBefore.UNI.sub(investorWithdrawAmount))
      expect(fundAfter.feeTokens[1][0]).to.equal(UNI)
      expect(fundAfter.feeTokens[1][1]).to.equal(fundBefore.feeTokens[1][1].add(fee))
    })

    it("notInvestor withdraw UNI", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const notInvestorBefore = await getInvestorAccount(fundId1, notInvestor.address)

      await expect(fund.connect(notInvestor).withdraw(fundId1, UNI, ethers.utils.parseEther("0.00001")))
        .to.be.revertedWith('US')

      const fundAfter = await getFundAccount(fundId1)
      const notInvestorAfter = await getInvestorAccount(fundId1, notInvestor.address)

      expect(fundAfter.UNI).to.equal(fundBefore.UNI)
      expect(notInvestorAfter.fundUNI).to.equal(notInvestorBefore.fundUNI)
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

      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(fundAfter.WETH).to.equal(fundBefore.WETH.sub(swapInputAmount))
      expect(fundAfter.UNI).to.be.above(fundBefore.UNI)
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(swapInputAmount))
      expect(manager1After.fundUNI).to.be.above(manager1Before.fundUNI)


      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })

      const fundAfter2 = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter2.WETH).to.equal(fundAfter.WETH.sub(swapInputAmount))
      expect(fundAfter2.UNI).to.be.above(fundAfter.UNI)
      expect(investor1After.fundWETH).to.equal(investor1Before.fundWETH.sub(swapInputAmount))
      expect(investor1After.fundUNI).to.be.above(investor1Before.fundUNI)
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

      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(fundAfter.UNI).to.equal(fundBefore.UNI.sub(swapInputAmount))
      expect(fundAfter.WETH).to.be.above(fundBefore.WETH)
      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.sub(swapInputAmount))
      expect(manager1After.fundWETH).to.be.above(manager1Before.fundWETH)
      
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })

      const fundAfter2 = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter2.UNI).to.equal(fundAfter.UNI.sub(swapInputAmount))
      expect(fundAfter2.WETH).to.be.above(fundAfter.WETH)
      expect(investor1After.fundUNI).to.equal(investor1Before.fundUNI.sub(swapInputAmount))
      expect(investor1After.fundWETH).to.be.above(investor1Before.fundWETH)
    })

    it("invalid case", async function () {

    })

  })

  describe('withdrawFee', () => {

    it("withdrawFee WETH", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).withdrawFee(fundId1, WETH9, 10000)

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(fundAfter.WETH).to.equal(fundBefore.WETH.sub(10000))
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH)
      expect(fundAfter.feeTokens[0][0]).to.equal(WETH9)
      expect(fundAfter.feeTokens[0][1]).to.equal(fundBefore.feeTokens[0][1].sub(10000))

      await expect(fund.connect(investor1).withdrawFee(fundId1, WETH9, 10000)).to.be.revertedWith('NM')
      await expect(fund.connect(manager2).withdrawFee(fundId1, WETH9, 10000)).to.be.revertedWith('NM')
    })

    it("withdrawFee UNI", async function () {
      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).withdrawFee(fundId1, UNI, 10000)

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(fundAfter.UNI).to.equal(fundBefore.UNI.sub(10000))
      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI)
      expect(fundAfter.feeTokens[1][0]).to.equal(UNI)
      expect(fundAfter.feeTokens[1][1]).to.equal(fundBefore.feeTokens[1][1].sub(10000))

      await expect(fund.connect(investor1).withdrawFee(fundId1, UNI, 10000)).to.be.revertedWith('NM')
      await expect(fund.connect(manager2).withdrawFee(fundId1, UNI, 10000)).to.be.revertedWith('NM')
    })

    it("no exist token", async function () {
      await expect(fund.connect(manager1).withdrawFee(fundId1, DAI, 10000)).to.be.revertedWith('FD')
    })

    it("not enough token amount", async function () {
      await expect(fund.connect(manager1).withdrawFee(fundId1, UNI, ethers.utils.parseEther("1000.0"))).to.be.revertedWith('NET')
    })

    it("invalid case", async function () {

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

      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).mintNewPosition(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(fundAfter.UNI).to.be.below(fundBefore.UNI.sub(2000))
      expect(fundAfter.WETH).to.be.below(fundBefore.WETH.sub(10))
      expect(manager1After.fundUNI).to.be.below(manager1Before.fundUNI.sub(2000))
      expect(manager1After.fundWETH).to.be.below(manager1Before.fundWETH.sub(10))

      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(manager1).mintNewPosition(
        fundId1,
        investor1.address,
        params, 
        { value: 0 }
      )

      const fundAfter2 = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter2.UNI).to.be.below(fundAfter.UNI.sub(2000))
      expect(fundAfter2.WETH).to.be.below(fundAfter.WETH.sub(10))
      expect(investor1After.fundUNI).to.be.below(investor1Before.fundUNI.sub(2000))
      expect(investor1After.fundWETH).to.be.below(investor1Before.fundWETH.sub(10))
    })

  })

  describe('increaseLiquidity', () => {

    it("increase liquidity WETH + UNI", async function () {
      const WETHAmount = BigNumber.from(100)
      const UNIAmount = BigNumber.from(20000)
      const minWETHAmount = BigNumber.from(10)
      const minUNIAmount = BigNumber.from(2000)

      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const tokenId = await nonfungiblePositionManager.connect(manager1).positions(tokenIds[0])

      let params 
      if (tokenId.token0 == WETH9 && tokenId.token1 == UNI) {
        params = increaseParams(
          tokenIds[0],
          WETHAmount,
          UNIAmount,
          minWETHAmount,
          minUNIAmount,
        )
      } else {
        params = increaseParams(
          tokenIds[0],
          UNIAmount,
          WETHAmount,
          minUNIAmount,
          minWETHAmount,
        )
      }

      await fund.connect(manager1).increaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter.UNI).to.be.below(fundBefore.UNI.sub(minUNIAmount))
      expect(fundAfter.WETH).to.be.below(fundBefore.WETH.sub(minWETHAmount))
      expect(investor1After.fundUNI).to.be.below(investor1Before.fundUNI.sub(minUNIAmount))
      expect(investor1After.fundWETH).to.be.below(investor1Before.fundWETH.sub(minWETHAmount))
    })

  })

  describe('collectPositionFee', () => {
    
    it("collect fee WETH + UNI", async function () {
      const tokenIds = await info.connect(investor1).getTokenIds(fundId1, investor1.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )

      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(investor1).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI)
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH)
      expect(fundAfter.feeTokens[0][1]).to.be.at.least(fundBefore.feeTokens[0][1])
      expect(fundAfter.feeTokens[1][1]).to.be.at.least(fundBefore.feeTokens[1][1])
      expect(investor1After.fundUNI).to.be.at.least(investor1Before.fundUNI)
      expect(investor1After.fundWETH).to.be.at.least(investor1Before.fundWETH)
    })
  })

  describe('decreaseLiquidity', () => {

    it("decrease liquidity WETH + UNI", async function () {
      const minWETHAmount = BigNumber.from(10)
      const minUNIAmount = BigNumber.from(2000)

      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      const tokenIds = await info.connect(investor1).getTokenIds(fundId1, investor1.address)
      const tokenId = await nonfungiblePositionManager.connect(investor1).positions(tokenIds[0])

      let params 
      if (tokenId.token0 == WETH9 && tokenId.token1 == UNI) {
        params = decreaseParams(
          tokenIds[0],
          1000,
          minWETHAmount,
          minUNIAmount,
        )
      } else {
        params = decreaseParams(
          tokenIds[0],
          1000,
          minUNIAmount,
          minWETHAmount,
        )
      }

      await fund.connect(investor1).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI.add(minUNIAmount))
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH.add(minWETHAmount))
      expect(investor1After.fundUNI).to.be.at.least(investor1Before.fundUNI.add(minUNIAmount))
      expect(investor1After.fundWETH).to.be.at.least(investor1Before.fundWETH.add(minWETHAmount))
    })

  })

})