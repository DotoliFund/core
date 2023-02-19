import { Wallet, constants, BigNumber, ContractTransaction, Contract } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { DotoliFactory } from '../typechain-types/contracts/DotoliFactory'
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

  let swapRouterAddress: string
  let liquidityRouterAddress: string
  let factoryAddress: string
  let fundAddress: string

  let swapRouter: Contract
  let liquidityRouter: Contract
  let factory: Contract
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
        fund.connect(who).getInvestorTokenAmount(fundId, who, WETH9),
        fund.connect(who).getInvestorTokenAmount(fundId, who, UNI),
        fund.connect(who).getFeeTokens(fundId),
      ])
      return {
        WETH9: balances[0],
        UNI: balances[1],
        fundWETH: balances[2],
        fundUNI: balances[3],
        feeTokens: balances[4],
      }
    }

    getFundAccount = async (fundId: BigNumber) => {
      const balances = await Promise.all([
        fund.connect(notInvestor).getFundTokenAmount(fundId, WETH9),
        fund.connect(notInvestor).getFundTokenAmount(fundId, UNI),
      ])
      return {
        WETH9: balances[0],
        UNI: balances[1],
      }
    }
  })

  before("Deploy SwapRouter Contract", async function () {
    const SwapRouter = await ethers.getContractFactory("SwapRouter")
    const Router = await SwapRouter.connect(deployer).deploy()
    await Router.deployed()
    swapRouterAddress = Router.address
    swapRouter = await ethers.getContractAt("SwapRouter", swapRouterAddress)
  })

  before("Deploy LiquidityRouter Contract", async function () {
    const LiquidityRouter = await ethers.getContractFactory("LiquidityRouter")
    const Router = await LiquidityRouter.connect(deployer).deploy()
    await Router.deployed()
    liquidityRouterAddress = Router.address
    liquidityRouter = await ethers.getContractAt("LiquidityRouter", liquidityRouterAddress)
  })

  before("Deploy DotoliFactory Contract", async function () {
    const DotoliFactory = await ethers.getContractFactory("DotoliFactory")
    const Factory = await DotoliFactory.connect(deployer).deploy(DOTOLI, WETH9)
    await Factory.deployed()
    factoryAddress = Factory.address
    factory = await ethers.getContractAt("DotoliFactory", factoryAddress)
  })

  before("Deploy DotoliFund Contract", async function () {
    const DotoliFund = await ethers.getContractFactory("DotoliFund")
    const Fund = await DotoliFund.connect(deployer).deploy(factoryAddress, WETH9, swapRouterAddress, liquidityRouterAddress)
    await Fund.deployed()
    fundAddress = Fund.address
    fund = await ethers.getContractAt("DotoliFund", fundAddress)
  })

  it("create 1st fund", async function () {
    await fund.connect(manager1).createFund()
    const savedFundId = await fund.connect(manager1).managingFund(manager1.address)
    expect(savedFundId).to.equal(BigNumber.from(1))
    fundId1 = savedFundId

    const fundIdCount = await fund.connect(manager1).fundIdCount()
    expect(fundIdCount).to.equal(BigNumber.from(1))
  })

  it("create 2nd fund", async function () {
    await fund.connect(manager2).createFund()
    const savedFundId = await fund.connect(manager2).managingFund(manager2.address)
    expect(savedFundId).to.equal(BigNumber.from(2))
    fundId2 = savedFundId

    const fundIdCount = await fund.connect(manager1).fundIdCount()
    expect(fundIdCount).to.equal(BigNumber.from(2))
  })

  describe('manager1', () => {

    it("set UNI to white list token", async function () {
      await expect(factory.connect(deployer).setWhiteListToken(UNI))
    })

    it("check correct factory", async function () {
      expect(await fund.connect(manager1).factory()).to.equal(factoryAddress)
    })

    it("check manager is subscribed to fund1", async function () {
      expect(await fund.connect(manager1).isSubscribed(manager1.address, fundId1)).to.be.true
    })

    it("convert ETH to WETH", async function () {
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)
      await weth9.connect(manager1).deposit({
        from: manager1.address,
        value: WETH_CHARGE_AMOUNT
      })
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(manager1After.WETH9).to.equal(manager1Before.WETH9.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH to fund1", async function () {
      const fund1Before = await getFundAccount(fundId1, notInvestor)

      await manager1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      const fund1After = await getFundAccount(fundId1, notInvestor)
      expect(manager1After.fundWETH).to.equal(DEPOSIT_AMOUNT)
      expect(manager1After.feeTokens).to.be.empty
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw ETH", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)
      await fund.connect(manager1).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)
      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.feeTokens).to.be.empty
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(WITHDRAW_AMOUNT))
    })

    it("deposit WETH", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await weth9.connect(manager1).approve(fundAddress, constants.MaxUint256)
      await fund.connect(manager1).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(DEPOSIT_AMOUNT))
      expect(manager1After.feeTokens).to.be.empty
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw WETH", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.feeTokens).to.be.empty
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(WITHDRAW_AMOUNT))
    })


    describe('swap', () => {

      describe("#exactInputSingle", async function () {

        it("WETH -> UNI", async function () {
          const swapInputAmount = BigNumber.from(1000000)
          const amountOutMinimum = BigNumber.from(1)

          const fund1Before = await getFundAccount(fundId1)
          const manager1Before = await getInvestorAccount(fundId1, manager1.address)

          const params = exactInputSingleParams(
            WETH9,
            UNI,
            swapInputAmount,
            amountOutMinimum,
            BigNumber.from(0)
          )
          await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })
          const fund1After = await getFundAccount(fundId1)
          const manager1After = await getInvestorAccount(fundId1, manager1.address)

          expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(swapInputAmount))
          expect(fund1After.UNI).to.be.above(fund1Before.UNI)
          expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(swapInputAmount))
          expect(manager1After.fundUNI).to.be.above(manager1Before.fundUNI)
        })

        it("UNI -> WETH", async function () {
          const swapInputAmount = BigNumber.from(1000000)
          const amountOutMinimum = BigNumber.from(1)

          const fund1Before = await getFundAccount(fundId1)
          const manager1Before = await getInvestorAccount(fundId1, manager1.address)

          const params = exactInputSingleParams(
            UNI,
            WETH9, 
            swapInputAmount, 
            amountOutMinimum, 
            BigNumber.from(0)
          )
          await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

          const fund1After = await getFundAccount(fundId1)
          const manager1After = await getInvestorAccount(fundId1, manager1.address)

          expect(fund1After.WETH9).to.be.above(fund1Before.WETH9)
          expect(fund1After.UNI).to.equal(fund1Before.UNI.sub(swapInputAmount))
          expect(manager1After.fundWETH).to.be.above(manager1Before.fundWETH)
          expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.sub(swapInputAmount))
        })

      })

      describe("#exactOutputSingle", async function () {

        it("WETH -> UNI", async function () {
          const swapOutputAmount = BigNumber.from(1000000)
          const amountInMaximum = BigNumber.from(100000)

          const fund1Before = await getFundAccount(fundId1)
          const manager1Before = await getInvestorAccount(fundId1, manager1.address)

          const params = exactOutputSingleParams(
            WETH9, 
            UNI, 
            swapOutputAmount, 
            amountInMaximum, 
            BigNumber.from(0)
          )
          await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

          const fund1After = await getFundAccount(fundId1)
          const manager1After = await getInvestorAccount(fundId1, manager1.address)

          expect(fund1After.WETH9).to.be.below(fund1Before.WETH9)
          expect(fund1After.UNI).to.equal(fund1Before.UNI.add(swapOutputAmount))
          expect(manager1After.fundWETH).to.be.below(manager1Before.fundWETH)
          expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.add(swapOutputAmount))
        })

        it("UNI -> WETH", async function () {
          const swapOutputAmount = BigNumber.from(100000)
          const amountInMaximum = BigNumber.from(30000000)

          const fund1Before = await getFundAccount(fundId1)
          const manager1Before = await getInvestorAccount(fundId1, manager1.address)

          const params = exactOutputSingleParams(
            UNI,
            WETH9, 
            swapOutputAmount, 
            amountInMaximum, 
            BigNumber.from(0)
          )
          await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

          const fund1After = await getFundAccount(fundId1)
          const manager1After = await getInvestorAccount(fundId1, manager1.address)

          expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(swapOutputAmount))
          expect(fund1After.UNI).to.be.below(fund1Before.UNI)
          expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(swapOutputAmount))
          expect(manager1After.fundUNI).to.be.below(manager1Before.fundUNI)
        })

      })

      describe("#exactInput", async function () {

        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9, DAI, UNI]
          const swapInputAmount = BigNumber.from(10000)
          const amountOutMinimum = BigNumber.from(1)

          const fund1Before = await getFundAccount(fundId1)
          const manager1Before = await getInvestorAccount(fundId1, manager1.address)

          const params = exactInputParams(
            tokens,
            swapInputAmount,
            amountOutMinimum
          )
          await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

          const fund1After = await getFundAccount(fundId1)
          const manager1After = await getInvestorAccount(fundId1, manager1.address)

          expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(swapInputAmount))
          expect(fund1After.UNI).to.be.above(fund1Before.UNI)
          expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(swapInputAmount))
          expect(manager1After.fundUNI).to.be.above(manager1Before.fundUNI)
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI, DAI, WETH9]
          const swapInputAmount = BigNumber.from(3000000)
          const amountOutMinimum = BigNumber.from(1)

          const fund1Before = await getFundAccount(fundId1)
          const manager1Before = await getInvestorAccount(fundId1, manager1.address)

          const params = exactInputParams(
            tokens,
            swapInputAmount,
            amountOutMinimum
          )
          await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

          const fund1After = await getFundAccount(fundId1)
          const manager1After = await getInvestorAccount(fundId1, manager1.address)

          expect(fund1After.WETH9).to.be.above(fund1Before.WETH9)
          expect(fund1After.UNI).to.equal(fund1Before.UNI.sub(swapInputAmount))
          expect(manager1After.fundWETH).to.be.above(manager1Before.fundWETH)
          expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.sub(swapInputAmount))
        })

      })

      describe("#exactOutput", async function () {

        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9, DAI, UNI]
          const swapOutputAmount = BigNumber.from(1000000)
          const amountInMaximum = BigNumber.from(100000)

          const fund1Before = await getFundAccount(fundId1)
          const manager1Before = await getInvestorAccount(fundId1, manager1.address)

          const params = exactOutputParams(
            tokens,
            swapOutputAmount,
            amountInMaximum
          )
          await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

          const fund1After = await getFundAccount(fundId1)
          const manager1After = await getInvestorAccount(fundId1, manager1.address)

          expect(fund1After.WETH9).to.be.below(fund1Before.WETH9)
          expect(fund1After.UNI).to.equal(fund1Before.UNI.add(swapOutputAmount))
          expect(manager1After.fundWETH).to.be.below(manager1Before.fundWETH)
          expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.add(swapOutputAmount))
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI, DAI, WETH9]
          const swapOutputAmount = BigNumber.from(10000)
          const amountInMaximum = BigNumber.from(3000000)

          const fund1Before = await getFundAccount(fundId1)
          const manager1Before = await getInvestorAccount(fundId1, manager1.address)

          const params = exactOutputParams(
            tokens,
            swapOutputAmount,
            amountInMaximum,
            fundAddress
          )
          await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

          const fund1After = await getFundAccount(fundId1)
          const manager1After = await getInvestorAccount(fundId1, manager1.address)

          expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(swapOutputAmount))
          expect(fund1After.UNI).to.be.below(fund1Before.UNI)
          expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(swapOutputAmount))
          expect(manager1After.fundUNI).to.be.below(manager1Before.fundUNI)
        })
      })
    })

    // if error msg is 'Price slippage check',
    // check amount0 vs amount1 ratio. 
    // (2022/10/31) UNI vs ETH => 200 : 1 (OK)
    describe("liquidity manager1's token : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintParams(
          fundId1,
          manager1.address,
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
        await fund.connect(manager1).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = increaseParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager1).increaseLiquidity(params, { value: 0 })
      })

      it("get position's token0, token1, amount0, amount1 by LiquidityRouter", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const tokenAmount = await liquidityRouter.connect(manager1).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = collectParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund.connect(manager1).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = decreaseParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager1).decreaseLiquidity(params, { value: 0 })
      })
    })
  })

  describe('manager1 + investor1', () => {

    it("set UNI to white list token", async function () {
      await expect(factory.connect(deployer).setWhiteListToken(UNI))
    })

    it("investor1 not subscribed to fund1 yet", async function () {
      expect(await fund.connect(investor1).isSubscribed(investor1.address, fundId1)).to.be.false
    })

    it("investor1 fail to deposit, withdraw, swap", async function () {
      await weth9.connect(investor1).approve(fundAddress, constants.MaxUint256)
      
      //deposit, withdraw
      await expect(fund.connect(investor1).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)).to.be.reverted
      await expect(fund.connect(investor1).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)).to.be.reverted
      
      //swap exactInput
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = BigNumber.from(10000)
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )

      await expect(fund.connect(investor1).swap(fundId1, investor1.address, params, { value: 0 })).to.be.reverted
    })

    it("investor1 subscribe to fund1", async function () {
      await fund.connect(investor1).subscribe(fundId1)
    })

    it("check investor1 is subscribed", async function () {
      const isSubscribed = await fund.connect(investor1).isSubscribed(investor1.address, fundId1)
      expect(isSubscribed).to.be.true
    })

    it("convert ETH -> WETH", async function () {
        const investor1Before = await getInvestorAccount(fundId1, investor1.address)

        await weth9.connect(investor1).deposit({
          from: investor1.address,
          value: WETH_CHARGE_AMOUNT
        })

        const investor1After = await getInvestorAccount(fundId1, investor1.address)
        expect(investor1After.WETH9).to.equal(investor1Before.WETH9.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH to fund1", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await investor1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      const fund1After = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)

      expect(investor1After.feeTokens).to.be.empty
      expect(investor1After.fundWETH).to.equal(investor1Before.fundWETH.add(DEPOSIT_AMOUNT))
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw ETH from fund1", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(investor1).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const fund1After = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(investor1After.fundWETH).to.equal(investor1Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // tokenAddress
      expect(manager1After.feeTokens[0][1]).to.equal(fee) // amount
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(investorWithdrawAmount))
    })

    it("deposit WETH to fund1", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await weth9.connect(investor1).approve(fundAddress, constants.MaxUint256)
      await fund.connect(investor1).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)

      const fund1After = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(investor1After.fundWETH).to.equal(investor1Before.fundWETH.add(DEPOSIT_AMOUNT))
      expect(manager1After.feeTokens[0][0]).to.equal(manager1Before.feeTokens[0][0]) // tokenAddress
      expect(manager1After.feeTokens[0][1]).to.equal(manager1Before.feeTokens[0][1]) // amount
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw WETH from fund1", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(investor1).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const fund1After = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(investor1After.fundWETH).to.equal(investor1Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // tokenAddress
      expect(manager1After.feeTokens[0][1]) 
        .to.equal(BigNumber.from(manager1Before.feeTokens[0][1]).add(fee)) // amount
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(investorWithdrawAmount))
    })

    it("set UNI to white list token", async function () {
      await expect(factory.connect(deployer).setWhiteListToken(UNI))
    })

    describe("investor1's swap must be failed", async function () {

      it("#exactInputSingle", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputSingleParams(
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await expect(fund.connect(investor1).swap(fundId1, investor1.address, params, { value: 0 })).to.be.reverted
      })

      it("#exactOutputSingle", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)

        const params = exactOutputSingleParams(
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await expect(fund.connect(investor1).swap(fundId1, investor1.address, params, { value: 0 })).to.be.reverted
      })

      it("#exactInput", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputParams(
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await expect(fund.connect(investor1).swap(fundId1, investor1.address, params, { value: 0 })).to.be.reverted
      })

      it("#exactOutput", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)

        const params = exactOutputParams(
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await expect(fund.connect(investor1).swap(fundId1, investor1.address, params, { value: 0 })).to.be.reverted
      })
    })

    describe("investor1 swap WETH -> UNI, withdraw UNI", async function () {

      it("#exactInputSingle + withdraw", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const fund1Before = await getFundAccount(fundId1)
        const investor1Before = await getInvestorAccount(fundId1, investor1.address)

        //swap
        const params = exactInputSingleParams(
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })

        const fund1Middle = await getFundAccount(fundId1)
        const investor1Middle = await getInvestorAccount(fundId1, investor1.address)
        const manager1Middle = await getInvestorAccount(fundId1, manager1.address)
        const withdrawAmountUNI = BigNumber.from(investor1Middle.fundUNI).div(2)

        expect(fund1Middle.WETH9).to.equal(fund1Before.WETH9.sub(swapInputAmount))
        expect(investor1Middle.fundWETH).to.equal(investor1Before.fundWETH.sub(swapInputAmount))

        //withdraw uni
        await fund.connect(investor1).withdraw(fundId1, UNI, withdrawAmountUNI)

        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const investor1After = await getInvestorAccount(fundId1, investor1.address)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)

        expect(investor1After.fundUNI).to.equal(investor1Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.feeTokens[0][1]).to.equal(manager1Middle.feeTokens[0][1])
        expect(manager1After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.feeTokens[1][1]).to.equal(fee)
        expect(fund1After.UNI).to.equal(fund1Middle.UNI.sub(investorWithdrawAmount))
      })

      it("#exactOutputSingle + withdraw", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund1Before = await getFundAccount(fundId1)
        const investor1Before = await getInvestorAccount(fundId1, investor1.address)
        const manager1Before = await getInvestorAccount(fundId1, manager1.address)

        const params = exactOutputSingleParams(
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })

        const fund1Middle = await getFundAccount(fundId1)
        const investor1Middle = await getInvestorAccount(fundId1, investor1.address)
        const manager1Middle = await getInvestorAccount(fundId1, manager1.address)

        expect(fund1Middle.UNI).to.equal(fund1Before.UNI.add(swapOutputAmount))
        expect(investor1Middle.fundUNI).to.equal(investor1Before.fundUNI.add(swapOutputAmount))

        //withdraw uni
        await fund.connect(investor1).withdraw(fundId1, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const investor1After = await getInvestorAccount(fundId1, investor1.address)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)

        expect(investor1After.fundUNI).to.equal(investor1Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.feeTokens[0][1]).to.equal(manager1Middle.feeTokens[0][1])
        expect(manager1After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund1After.UNI).to.equal(fund1Middle.UNI.sub(investorWithdrawAmount))
      })

      it("#exactInput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund1Before = await getFundAccount(fundId1)
        const investor1Before = await getInvestorAccount(fundId1, investor1.address)

        const params = exactInputParams(
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })

        const fund1Middle = await getFundAccount(fundId1)
        const investor1Middle = await getInvestorAccount(fundId1, investor1.address)
        const manager1Middle = await getInvestorAccount(fundId1, manager1.address)
        const withdrawAmountUNI = BigNumber.from(investor1Middle.fundUNI).div(2)

        expect(fund1Middle.WETH9).to.equal(fund1Before.WETH9.sub(swapInputAmount))
        expect(investor1Middle.fundWETH).to.equal(investor1Before.fundWETH.sub(swapInputAmount))

        //withdraw uni
        await fund.connect(investor1).withdraw(fundId1, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const investor1After = await getInvestorAccount(fundId1, investor1.address)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)

        expect(investor1After.fundUNI).to.equal(investor1Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.feeTokens[0][1]).to.equal(manager1Middle.feeTokens[0][1])
        expect(manager1After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund1After.UNI).to.equal(fund1Middle.UNI.sub(investorWithdrawAmount))
      })

      it("#exactOutput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund1Before = await getFundAccount(fundId1)
        const investor1Before = await getInvestorAccount(fundId1, investor1.address)
        const manager1Before = await getInvestorAccount(fundId1, manager1.address)

        const params = exactOutputParams(
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })

        const fund1Middle = await getFundAccount(fundId1)
        const investor1Middle = await getInvestorAccount(fundId1, investor1.address)
        const manager1Middle = await getInvestorAccount(fundId1, manager1.address)

        expect(fund1Middle.UNI).to.equal(fund1Before.UNI.add(swapOutputAmount))
        expect(investor1Middle.fundUNI).to.equal(investor1Before.fundUNI.add(swapOutputAmount))

        //withdraw uni
        await fund.connect(investor1).withdraw(fundId1, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const investor1After = await getInvestorAccount(fundId1, investor1.address)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)

        expect(investor1After.fundUNI).to.equal(investor1Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.feeTokens[0][1]).to.equal(manager1Middle.feeTokens[0][1])
        expect(manager1After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund1After.UNI).to.equal(fund1Middle.UNI.sub(investorWithdrawAmount))
      })
    })

    // if error msg is 'Price slippage check',
    // check amount0 vs amount1 ratio. 
    // (2022/10/31) UNI vs ETH => 200 : 1 (OK)
    describe("investor1's liquidity token : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintParams(
          fundId1,
          investor1.address,
          UNI,
          WETH9,
          FeeAmount.MEDIUM,
          getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          BigNumber.from(2000000),
          BigNumber.from(10000),
          BigNumber.from(200000),
          BigNumber.from(1000),
        )
        await fund.connect(manager1).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = increaseParams(
          fundId1,
          investor1.address,
          tokenIds[0],
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund.connect(manager1).increaseLiquidity(params, { value: 0 })
      })

      it("LiquidityRouter get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, investor1.address)
        const tokenAmount = await liquidityRouter.connect(manager1).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = collectParams(
          fundId1,
          investor1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund.connect(manager1).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = decreaseParams(
          fundId1,
          investor1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager1).decreaseLiquidity(params, { value: 0 })
      })

    })

    describe("invalid parameter on liquidity request", async function () {

      it("mint new position -> wrong investor", async function () {
        const params = mintParams(
          fundId1,
          manager2.address,
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
        await expect(fund.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("get manager1, investor1 position's token0, token1, amount0, amount1 in fund1", async function () {
        const manager1TokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const manager1TokenAmount = await liquidityRouter.connect(manager1).getPositionTokenAmount(manager1TokenIds[0].toNumber())
        const investor1TokenIds = await fund.connect(investor1).getTokenIds(fundId1, investor1.address)
        const investor1TokenAmount = await liquidityRouter.connect(investor1).getPositionTokenAmount(investor1TokenIds[0].toNumber())
        // console.log('manager1 tokenId :', manager1TokenAmount)
        // console.log('investor1 tokenId :', investor1TokenAmount)
      })

      it("get manager1, investor1 investor tokens in fund1", async function () {
        const manager1Tokens = await fund.connect(manager1).getInvestorTokens(fundId1, manager1.address)
        const manager1Token0 = manager1Tokens[0].tokenAddress
        const manager1Token1 = manager1Tokens[1].tokenAddress
        const manager1Amount0 = manager1Tokens[0].amount
        const manager1Amount1 = manager1Tokens[1].amount
        // console.log('manager1 token0 address :', manager1Token0)
        // console.log('manager1 token0 amount :', manager1Amount0)
        // console.log('manager1 token1 address :', manager1Token1)
        // console.log('manager1 token1 amount :', manager1Amount1)

        const investor1Tokens = await fund.connect(investor1).getInvestorTokens(fundId1, investor1.address)
        const investor1Token0 = investor1Tokens[0].tokenAddress
        const investor1Token1 = investor1Tokens[1].tokenAddress
        const investor1Amount0 = investor1Tokens[0].amount
        const investor1Amount1 = investor1Tokens[1].amount
        // console.log('investor1 token0 address :', investor1Token0)
        // console.log('investor1 token0 amount :', investor1Amount0)
        // console.log('investor1 token1 address :', investor1Token1)
        // console.log('investor1 token1 amount :', investor1Amount1)
      })

      it("mint new position -> too many token amount", async function () {
        const params = mintParams(
          fundId1,
          manager1.address,
          UNI,
          WETH9,
          FeeAmount.MEDIUM,
          getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          BigNumber.from(20000000000),
          BigNumber.from(100000000),
          BigNumber.from(2000000),
          BigNumber.from(10000),
        )
        await expect(fund.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("reset UNI from white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true

        await factory.connect(deployer).resetWhiteListToken(UNI)

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

      })

      it("mint new position -> not white list token", async function () {
        const params = mintParams(
          fundId1,
          manager1.address,
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
        await expect(fund.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("set UNI to white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        await factory.connect(deployer).setWhiteListToken(UNI)

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true
      })

      it("increase liquidity -> wrong investor", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = increaseParams(
          fundId1,
          investor1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("increase liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = increaseParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("increase liquidity -> too many token amount", async function () {
        // for debug
        // const investor1Tokens = await fund.connect(investor1).getInvestorTokens(fundId1, investor1.address)
        // const investor1Token0 = investor1Tokens[0].tokenAddress
        // const investor1Token1 = investor1Tokens[1].tokenAddress
        // const investor1Amount0 = investor1Tokens[0].amount
        // const investor1Amount1 = investor1Tokens[1].amount
        // console.log('investor1 token0 address :', investor1Token0)
        // console.log('investor1 token0 amount :', investor1Amount0)
        // console.log('investor1 token1 address :', investor1Token1)
        // console.log('investor1 token1 amount :', investor1Amount1)

        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = increaseParams(
          fundId1,
          investor1.address,
          tokenIds[0],
          BigNumber.from(600000000),
          BigNumber.from(3000000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await expect(fund.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong investor", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = collectParams(
          fundId1,
          investor1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund.connect(manager1).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong tokenId", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = collectParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund.connect(manager1).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong investor", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = decreaseParams(
          fundId1,
          investor1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = decreaseParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many liquidity", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        //console.log(tokenIdInfo.liquidity)

        const params = decreaseParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          3000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many token amount", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        //console.log(tokenIdInfo.liquidity)

        const params = decreaseParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("fee out -> not manager", async function () {
        await expect(fund.connect(investor1).withdrawFee(fundId1, UNI, 100000)).to.be.reverted
      })

      it("fee out -> too many token amount", async function () {
        const feeTokens = await fund.connect(manager1).getFeeTokens(fundId1)
        await expect(fund.connect(manager1).withdrawFee(fundId1, UNI, 2000000000)).to.be.reverted
      })
    })
  })

  describe('manager1 + manager2', () => {

    it("manager1 not subscribed to manager2 ", async function () {
      expect(await fund.connect(manager1).isSubscribed(manager1.address, fundId2)).to.be.false
    })

    it("manager2 not subscribed to manager1", async function () {
      expect(await fund.connect(manager2).isSubscribed(manager2.address, fundId1)).to.be.false
    })

    it("manager1 fail to deposit, withdraw and swap to fund2", async function () {
      await expect(manager1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId2)
      })).to.be.reverted

      await weth9.connect(manager1).approve(fundAddress, constants.MaxUint256)
      
      //deposit, withdraw
      await expect(fund.connect(manager1).deposit(fundId2, WETH9, DEPOSIT_AMOUNT)).to.be.reverted
      await expect(fund.connect(manager1).withdraw(fundId2, WETH9, WITHDRAW_AMOUNT)).to.be.reverted
      //swap exactInput
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = BigNumber.from(10000)
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await expect(fund.connect(manager1).swap(fundId2, manager1.address, params, { value: 0 })).to.be.reverted
    })

    it("manager2 fail to deposit, withdraw and swap to fund1", async function () {
      await expect(manager2.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })).to.be.reverted

      await weth9.connect(manager2).approve(fundAddress, constants.MaxUint256)
      
      //deposit, withdraw
      await expect(fund.connect(manager2).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)).to.be.reverted
      await expect(fund.connect(manager2).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)).to.be.reverted
      //swap exactInput
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = BigNumber.from(10000)
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await expect(fund.connect(manager2).swap(fundId1, manager2.address, params, { value: 0 })).to.be.reverted
    })

    it("manager1 subscribe to manager2", async function () {
      await fund.connect(manager1).subscribe(fundId2)
    })

    it("manager2 subscribe to manager1", async function () {
      await fund.connect(manager2).subscribe(fundId1)
    })

    it("check manager1, manager2 subscribed eash other", async function () {
      expect(await fund.connect(manager1).isSubscribed(manager1.address, fundId2)).to.be.true
      expect(await fund.connect(manager2).isSubscribed(manager2.address, fundId1)).to.be.true
    })

    it("manager1 deposit ETH to fund2", async function () {
      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)

      await manager1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId2)
      })

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager2After.feeTokens).to.be.empty
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(DEPOSIT_AMOUNT))
      expect(fund2After.WETH9).to.equal(fund2Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("manager1 withdraw ETH from fund2", async function () {
      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)

      await fund.connect(manager1).withdraw(fundId2, WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(manager2After.feeTokens[0][0]).to.equal(WETH9) // tokenAddress
      expect(manager2After.feeTokens[0][1]).to.equal(fee) // amount
      expect(fund2After.WETH9).to.equal(fund2Before.WETH9.sub(investorWithdrawAmount))
    })

    it("manager1 convert ETH -> WETH", async function () {
        const manager1Before = await getInvestorAccount(fundId2, manager1.address)

        await weth9.connect(manager1).deposit({
          from: manager1.address,
          value: WETH_CHARGE_AMOUNT
        })

        const manager1After = await getInvestorAccount(fundId2, manager1.address)
        expect(manager1After.WETH9).to.equal(manager1Before.WETH9.add(WETH_CHARGE_AMOUNT))
    })

    it("manager1 deposit WETH to fund2", async function () {
      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)
      const manager2Before = await getInvestorAccount(fundId2, manager2.address)

      await weth9.connect(manager1).approve(fundAddress, constants.MaxUint256)
      await fund.connect(manager1).deposit(fundId2, WETH9, DEPOSIT_AMOUNT)

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(DEPOSIT_AMOUNT))
      expect(manager2After.feeTokens[0][0]).to.equal(manager2Before.feeTokens[0][0]) // tokenAddress
      expect(manager2After.feeTokens[0][1]).to.equal(manager2Before.feeTokens[0][1]) // amount
      expect(fund2After.WETH9).to.equal(fund2Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("manager1 withdraw ETH from fund2", async function () {
      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)
      const manager2Before = await getInvestorAccount(fundId2, manager2.address)

      await fund.connect(manager1).withdraw(fundId2, WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(manager2After.feeTokens[0][0]).to.equal(WETH9) // tokenAddress
      expect(manager2After.feeTokens[0][1]) 
        .to.equal(BigNumber.from(manager2Before.feeTokens[0][1]).add(fee)) // amount
      expect(fund2After.WETH9).to.equal(fund2Before.WETH9.sub(investorWithdrawAmount))
    })

    it("manager2 deposit ETH to fund2", async function () {
      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)
      const manager2Before = await getInvestorAccount(fundId2, manager2.address)

      await manager2.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId2)
      })

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH)
      expect(manager2After.feeTokens[0][0]).to.equal(manager2Before.feeTokens[0][0]) // tokenAddress
      expect(manager2After.feeTokens[0][1]).to.equal(manager2Before.feeTokens[0][1]) // amount
      expect(fund2After.WETH9).to.equal(fund2Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("manager2 withdraw ETH from fund2", async function () {
      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)
      const manager2Before = await getInvestorAccount(fundId2, manager2.address)

      await fund.connect(manager2).withdraw(fundId2, WETH9, WITHDRAW_AMOUNT)

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH)
      expect(manager2After.fundWETH).to.equal(manager2Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(fund2After.WETH9).to.equal(fund2Before.WETH9.sub(WITHDRAW_AMOUNT))
    })

    it("manager2 convert ETH -> WETH", async function () {
        const manager2Before = await getInvestorAccount(fundId2, manager2.address)

        await weth9.connect(manager2).deposit({
          from: manager2.address,
          value: WETH_CHARGE_AMOUNT
        })

        const manager2After = await getInvestorAccount(fundId2, manager2.address)
        expect(manager2After.WETH9).to.equal(manager2Before.WETH9.add(WETH_CHARGE_AMOUNT))
    })

    it("manager2 deposit WETH to fund2", async function () {
      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)
      const manager2Before = await getInvestorAccount(fundId2, manager2.address)

      await weth9.connect(manager2).approve(fundAddress, constants.MaxUint256)
      await fund.connect(manager2).deposit(fundId2, WETH9, DEPOSIT_AMOUNT)

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH)
      expect(fund2After.WETH9).to.equal(fund2Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("manager2 withdraw ETH from fund2", async function () {
      const fund2Before = await getFundAccount(fundId2)
      const manager1Before = await getInvestorAccount(fundId2, manager1.address)
      const manager2Before = await getInvestorAccount(fundId2, manager2.address)

      await fund.connect(manager2).withdraw(fundId2, WETH9, WITHDRAW_AMOUNT)

      const fund2After = await getFundAccount(fundId2)
      const manager1After = await getInvestorAccount(fundId2, manager1.address)
      const manager2After = await getInvestorAccount(fundId2, manager2.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH)
      expect(manager2After.fundWETH).to.equal(manager2Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(manager2After.feeTokens[0][0]).to.equal(manager2Before.feeTokens[0][0]) // tokenAddress
      expect(manager2After.feeTokens[0][1]).to.equal(manager2Before.feeTokens[0][1]) // amount
      expect(fund2After.WETH9).to.equal(fund2Before.WETH9.sub(WITHDRAW_AMOUNT))
    })

    describe("manager1 reverted to swap fund2", async function () {

      it("#exactInputSingle", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputSingleParams(
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await expect(fund.connect(manager1).swap(fundId2, manager1.address, params, { value: 0 })).to.be.reverted
      })

      it("#exactOutputSingle", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)

        const params = exactOutputSingleParams(
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await expect(fund.connect(manager1).swap(fundId2, manager1.address, params, { value: 0 })).to.be.reverted
      })

      it("#exactInput", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputParams(
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await expect(fund.connect(manager1).swap(fundId2, manager1.address, params, { value: 0 })).to.be.reverted
      })

      it("#exactOutput", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)

        const params = exactOutputParams(
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await expect(fund.connect(manager1).swap(fundId2, manager1.address, params, { value: 0 })).to.be.reverted
      })
    })

    describe("manager2 swap manager1's token WETH -> UNI, withdraw manager1's UNI", async function () {

      it("#exactInputSingle => withdraw", async function () {
        const swapInputAmount = BigNumber.from(1000000)
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
        await fund.connect(manager2).swap(fundId2, manager1.address, params, { value: 0 })

        const fund2Middle = await getFundAccount(fundId2)
        const manager1Middle = await getInvestorAccount(fundId2, manager1.address)
        const manager2Middle = await getInvestorAccount(fundId2, manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager1Middle.fundUNI).div(2)

        expect(fund2Middle.WETH9).to.equal(fund2Before.WETH9.sub(swapInputAmount))
        expect(manager1Middle.fundWETH).to.equal(manager1Before.fundWETH.sub(swapInputAmount))

        //withdraw uni
        await fund.connect(manager1).withdraw(fundId2, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund2After = await getFundAccount(fundId2)
        const manager1After = await getInvestorAccount(fundId2, manager1.address)
        const manager2After = await getInvestorAccount(fundId2, manager2.address)

        expect(manager1After.fundUNI).to.equal(manager1Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager2After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager2After.feeTokens[0][1]).to.equal(manager2Middle.feeTokens[0][1])
        expect(manager2After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager2After.feeTokens[1][1]).to.equal(fee)
        expect(fund2After.UNI).to.equal(fund2Middle.UNI.sub(investorWithdrawAmount))
      })

      it("#exactOutputSingle => withdraw", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund2Before = await getFundAccount(fundId2)
        const manager1Before = await getInvestorAccount(fundId2, manager1.address)
        const manager2Before = await getInvestorAccount(fundId2, manager2.address)

        const params = exactOutputSingleParams(
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await fund.connect(manager2).swap(fundId2, manager1.address, params, { value: 0 })

        const fund2Middle = await getFundAccount(fundId2)
        const manager1Middle = await getInvestorAccount(fundId2, manager1.address)
        const manager2Middle = await getInvestorAccount(fundId2, manager2.address)

        expect(fund2Middle.UNI).to.equal(fund2Before.UNI.add(swapOutputAmount))
        expect(manager1Middle.fundUNI).to.equal(manager1Before.fundUNI.add(swapOutputAmount))

        //withdraw uni
        await fund.connect(manager1).withdraw(fundId2, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund2After = await getFundAccount(fundId2)
        const manager1After = await getInvestorAccount(fundId2, manager1.address)
        const manager2After = await getInvestorAccount(fundId2, manager2.address)

        expect(manager1After.fundUNI).to.equal(manager1Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager2After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager2After.feeTokens[0][1]).to.equal(manager2Middle.feeTokens[0][1])
        expect(manager2After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager2After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager2Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund2After.UNI).to.equal(fund2Middle.UNI.sub(investorWithdrawAmount))
      })

      it("#exactInput => withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund2Before = await getFundAccount(fundId2)
        const manager1Before = await getInvestorAccount(fundId2, manager1.address)

        const params = exactInputParams(
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await fund.connect(manager2).swap(fundId2, manager1.address, params, { value: 0 })

        const fund2Middle = await getFundAccount(fundId2)
        const manager1Middle = await getInvestorAccount(fundId2, manager1.address)
        const manager2Middle = await getInvestorAccount(fundId2, manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager1Middle.fundUNI).div(2)

        expect(fund2Middle.WETH9).to.equal(fund2Before.WETH9.sub(swapInputAmount))
        expect(manager1Middle.fundWETH).to.equal(manager1Before.fundWETH.sub(swapInputAmount))

        //withdraw uni
        await fund.connect(manager1).withdraw(fundId2, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund2After = await getFundAccount(fundId2)
        const manager1After = await getInvestorAccount(fundId2, manager1.address)
        const manager2After = await getInvestorAccount(fundId2, manager2.address)

        expect(manager1After.fundUNI).to.equal(manager1Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager2After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager2After.feeTokens[0][1]).to.equal(manager2Middle.feeTokens[0][1])
        expect(manager2After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager2After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager2Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund2After.UNI).to.equal(fund2Middle.UNI.sub(investorWithdrawAmount))
      })

      it("#exactOutput => withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund2Before = await getFundAccount(fundId2)
        const manager1Before = await getInvestorAccount(fundId2, manager1.address)
        const manager2Before = await getInvestorAccount(fundId2, manager2.address)

        const params = exactOutputParams(
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await fund.connect(manager2).swap(fundId2, manager1.address, params, { value: 0 })

        const fund2Middle = await getFundAccount(fundId2)
        const manager1Middle = await getInvestorAccount(fundId2, manager1.address)
        const manager2Middle = await getInvestorAccount(fundId2, manager2.address)

        expect(fund2Middle.UNI).to.equal(fund2Before.UNI.add(swapOutputAmount))
        expect(manager1Middle.fundUNI).to.equal(manager1Before.fundUNI.add(swapOutputAmount))

        //withdraw uni
        await fund.connect(manager1).withdraw(fundId2, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund2After = await getFundAccount(fundId2)
        const manager1After = await getInvestorAccount(fundId2, manager1.address)
        const manager2After = await getInvestorAccount(fundId2, manager2.address)

        expect(manager1After.fundUNI).to.equal(manager1Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager2After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager2After.feeTokens[0][1]).to.equal(manager2Middle.feeTokens[0][1])
        expect(manager2After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager2After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager2Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund2After.UNI).to.equal(fund2Middle.UNI.sub(investorWithdrawAmount))
      })
    })

    describe("manager2 swap manager2's token WETH -> UNI, withdraw manager2's UNI", async function () {

      it("#exactInputSingle => withdraw", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const fund2Before = await getFundAccount(fundId2)
        const manager2Before = await getInvestorAccount(fundId2, manager2.address)

        //swap
        const params = exactInputSingleParams(
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await fund.connect(manager2).swap(fundId2, manager2.address, params, { value: 0 })

        const fund2Middle = await getFundAccount(fundId2)
        const manager2Middle = await getInvestorAccount(fundId2, manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager2Middle.fundUNI).div(2)

        expect(fund2Middle.WETH9).to.equal(fund2Before.WETH9.sub(swapInputAmount))
        expect(manager2Middle.fundWETH).to.equal(manager2Before.fundWETH.sub(swapInputAmount))

        //withdraw uni
        await fund.connect(manager2).withdraw(fundId2, UNI, withdrawAmountUNI)

        const fund2After = await getFundAccount(fundId2)
        const manager2After = await getInvestorAccount(fundId2, manager2.address)

        expect(manager2After.fundUNI).to.equal(manager2Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager2After.feeTokens[0][0]).to.equal(manager2Before.feeTokens[0][0])
        expect(manager2After.feeTokens[0][1]).to.equal(manager2Before.feeTokens[0][1])
        expect(manager2After.feeTokens[1][0]).to.equal(manager2Before.feeTokens[1][0])
        expect(manager2After.feeTokens[1][1]).to.equal(manager2Before.feeTokens[1][1])
        expect(fund2After.UNI).to.equal(fund2Middle.UNI.sub(withdrawAmountUNI))
      })

      it("#exactOutputSingle => withdraw", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund2Before = await getFundAccount(fundId2)
        const manager2Before = await getInvestorAccount(fundId2, manager2.address)

        const params = exactOutputSingleParams(
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await fund.connect(manager2).swap(fundId2, manager2.address, params, { value: 0 })

        const fund2Middle = await getFundAccount(fundId2)
        const manager2Middle = await getInvestorAccount(fundId2, manager2.address)

        expect(fund2Middle.UNI).to.equal(fund2Before.UNI.add(swapOutputAmount))
        expect(manager2Middle.fundUNI).to.equal(manager2Before.fundUNI.add(swapOutputAmount))

        //withdraw uni
        await fund.connect(manager2).withdraw(fundId2, UNI, withdrawAmountUNI)

        const fund2After = await getFundAccount(fundId2)
        const manager2After = await getInvestorAccount(fundId2, manager2.address)

        expect(manager2After.fundUNI).to.equal(manager2Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager2After.feeTokens[0][0]).to.equal(manager2Before.feeTokens[0][0])
        expect(manager2After.feeTokens[0][1]).to.equal(manager2Before.feeTokens[0][1])
        expect(manager2After.feeTokens[1][0]).to.equal(manager2Before.feeTokens[1][0])
        expect(manager2After.feeTokens[1][1]).to.equal(manager2Before.feeTokens[1][1])
        expect(fund2After.UNI).to.equal(fund2Middle.UNI.sub(withdrawAmountUNI))
      })

      it("#exactInput => withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund2Before = await getFundAccount(fundId2)
        const manager2Before = await getInvestorAccount(fundId2, manager2.address)

        const params = exactInputParams(
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await fund.connect(manager2).swap(fundId2, manager2.address, params, { value: 0 })

        const fund2Middle = await getFundAccount(fundId2)
        const manager2Middle = await getInvestorAccount(fundId2, manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager2Middle.fundUNI).div(2)

        expect(fund2Middle.WETH9).to.equal(fund2Before.WETH9.sub(swapInputAmount))
        expect(manager2Middle.fundWETH).to.equal(manager2Before.fundWETH.sub(swapInputAmount))

        //withdraw uni
        await fund.connect(manager2).withdraw(fundId2, UNI, withdrawAmountUNI)

        const fund2After = await getFundAccount(fundId2)
        const manager2After = await getInvestorAccount(fundId2, manager2.address)

        expect(manager2After.fundUNI).to.equal(manager2Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager2After.feeTokens[0][0]).to.equal(manager2Before.feeTokens[0][0])
        expect(manager2After.feeTokens[0][1]).to.equal(manager2Before.feeTokens[0][1])
        expect(manager2After.feeTokens[1][0]).to.equal(manager2Before.feeTokens[1][0])
        expect(manager2After.feeTokens[1][1]).to.equal(manager2Before.feeTokens[1][1])
        expect(fund2After.UNI).to.equal(fund2Middle.UNI.sub(withdrawAmountUNI))
      })

      it("#exactOutput => withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund2Before = await getFundAccount(fundId2)
        const manager2Before = await getInvestorAccount(fundId2, manager2.address)

        const params = exactOutputParams(
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await fund.connect(manager2).swap(fundId2, manager2.address, params, { value: 0 })

        const fund2Middle = await getFundAccount(fundId2)
        const manager2Middle = await getInvestorAccount(fundId2, manager2.address)

        expect(fund2Middle.UNI).to.equal(fund2Before.UNI.add(swapOutputAmount))
        expect(manager2Middle.fundUNI).to.equal(manager2Before.fundUNI.add(swapOutputAmount))

        //withdraw uni
        await fund.connect(manager2).withdraw(fundId2, UNI, withdrawAmountUNI)

        const fund2After = await getFundAccount(fundId2)
        const manager2After = await getInvestorAccount(fundId2, manager2.address)

        expect(manager2After.fundUNI).to.equal(manager2Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager2After.feeTokens[0][0]).to.equal(manager2Before.feeTokens[0][0])
        expect(manager2After.feeTokens[0][1]).to.equal(manager2Before.feeTokens[0][1])
        expect(manager2After.feeTokens[1][0]).to.equal(manager2Before.feeTokens[1][0])
        expect(manager2After.feeTokens[1][1]).to.equal(manager2Before.feeTokens[1][1])
        expect(fund2After.UNI).to.equal(fund2Middle.UNI.sub(withdrawAmountUNI))
      })
    })

    describe("manager1's liquidity token in fund2 : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintParams(
          fundId2,
          manager1.address,
          UNI,
          WETH9,
          FeeAmount.MEDIUM,
          getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          BigNumber.from(2000000),
          BigNumber.from(10000),
          BigNumber.from(200000),
          BigNumber.from(1000),
        )
        await fund.connect(manager2).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const params = increaseParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund.connect(manager2).increaseLiquidity(params, { value: 0 })
      })

      it("LiquidityRouter get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const tokenAmount = await liquidityRouter.connect(manager2).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const params = collectParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund.connect(manager2).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const params = decreaseParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager2).decreaseLiquidity(params, { value: 0 })
      })
    })


    describe("manager2's liquidity token in fund2 : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintParams(
          fundId2,
          manager2.address,
          UNI,
          WETH9,
          FeeAmount.MEDIUM,
          getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          BigNumber.from(2000000),
          BigNumber.from(10000),
          BigNumber.from(200000),
          BigNumber.from(1000),
        )
        await fund.connect(manager2).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager2.address)
        const params = increaseParams(
          fundId2,
          manager2.address,
          tokenIds[0],
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund.connect(manager2).increaseLiquidity(params, { value: 0 })
      })

      it("LiquidityRouter get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager2.address)
        const tokenAmount = await liquidityRouter.connect(manager2).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager2.address)
        const params = collectParams(
          fundId2,
          manager2.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund.connect(manager2).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager2.address)
        const params = decreaseParams(
          fundId2,
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager2).decreaseLiquidity(params, { value: 0 })
      })
    })

    describe("manager1's invalid liquidity request on fund2 ", async function () {

      it("mint new position -> wrong investor", async function () {
        const params = mintParams(
          fundId2,
          investor2.address,
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
        await expect(fund.connect(manager2).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("get manager1, manager2 position's token0, token1, amount0, amount1 in fund2", async function () {
        const manager1TokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const manager1TokenAmount = await liquidityRouter.connect(manager2).getPositionTokenAmount(manager1TokenIds[0].toNumber())
        const manager2TokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager2.address)
        const manager2TokenAmount = await liquidityRouter.connect(manager2).getPositionTokenAmount(manager2TokenIds[0].toNumber())
      })

      it("get manager1, manager2 investor tokens in fund2", async function () {
        const manager1Tokens = await fund.connect(manager2).getInvestorTokens(fundId2, manager1.address)
        const manager1Token0 = manager1Tokens[0].tokenAddress
        const manager1Token1 = manager1Tokens[1].tokenAddress
        const manager1Amount0 = manager1Tokens[0].amount
        const manager1Amount1 = manager1Tokens[1].amount
        // console.log('manager1 token0 address :', manager1Token0)
        // console.log('manager1 token0 amount :', manager1Amount0)
        // console.log('manager1 token1 address :', manager1Token1)
        // console.log('manager1 token1 amount :', manager1Amount1)

        const manager2Tokens = await fund.connect(manager2).getInvestorTokens(fundId2, manager2.address)
        const manager2Token0 = manager2Tokens[0].tokenAddress
        const manager2Token1 = manager2Tokens[1].tokenAddress
        const manager2Amount0 = manager2Tokens[0].amount
        const manager2Amount1 = manager2Tokens[1].amount
        // console.log('manager2 token0 address :', manager2Token0)
        // console.log('manager2 token0 amount :', manager2Amount0)
        // console.log('manager2 token1 address :', manager2Token1)
        // console.log('manager2 token1 amount :', manager2Amount1)
      })

      it("mint new position -> too many token amount", async function () {
        const params = mintParams(
          fundId2,
          manager2.address,
          UNI,
          WETH9,
          FeeAmount.MEDIUM,
          getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          BigNumber.from(20000000000),
          BigNumber.from(100000000),
          BigNumber.from(200000000),
          BigNumber.from(1000000),
        )
        await expect(fund.connect(manager2).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("reset UNI from white list token", async function () {
        await expect(factory.connect(deployer).resetWhiteListToken(UNI))
      })

      it("mint new position -> not white list token", async function () {
        const params = mintParams(
          fundId2,
          manager2.address,
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
        await expect(fund.connect(manager2).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("set UNI to white list token", async function () {
        await expect(factory.connect(deployer).setWhiteListToken(UNI))
      })

      it("increase liquidity -> wrong investor", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const params = increaseParams(
          fundId2,
          manager2.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager2).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("increase liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager2.address)
        const params = increaseParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          UNI,
          WETH9,
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager2).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("increase liquidity -> too many token amount", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const params = increaseParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          BigNumber.from(600000000),
          BigNumber.from(3000000),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager2).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong investor", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const params = collectParams(
          fundId2,
          manager2.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund.connect(manager2).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong tokenId", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager2.address)
        const params = collectParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund.connect(manager2).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong investor", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const params = decreaseParams(
          fundId2,
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager2).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager2.address)
        const params = decreaseParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager2).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many liquidity", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        //console.log(tokenIdInfo.liquidity)

        const params = decreaseParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          200000,
          BigNumber.from(200000),
          BigNumber.from(1000),
        )
        await expect(fund.connect(manager2).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many token amount", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        //console.log(tokenIdInfo.liquidity)

        const params = decreaseParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await expect(fund.connect(manager2).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("fee out -> not manager", async function () {
        await expect(fund.connect(manager1).withdrawFee(fundId2, UNI, 100000)).to.be.reverted
      })

      it("fee out -> too many token amount", async function () {
        const feeTokens = await fund.connect(manager2).getFeeTokens(fundId2)
        await expect(fund.connect(manager2).withdrawFee(fundId2, UNI, 2000000000)).to.be.reverted
      })
    })

    describe("manager2 deposit to fund1", async function () {

      it("manager2 deposit ETH to fund1", async function () {
        const fund1Before = await getFundAccount(fundId1)
        const manager1Before = await getInvestorAccount(fundId1, manager1.address)
        const manager2Before = await getInvestorAccount(fundId1, manager2.address)

        await manager2.sendTransaction({
          to: fundAddress,
          value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
          data: BigNumber.from(fundId1)
        })

        const fund1After = await getFundAccount(fundId1)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)
        const manager2After = await getInvestorAccount(fundId1, manager2.address)

        expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH)
        expect(manager2After.fundWETH).to.equal(manager2Before.fundWETH.add(DEPOSIT_AMOUNT))
        expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(DEPOSIT_AMOUNT))
      })

      it("manager2 withdraw ETH from fund1", async function () {
        const fund1Before = await getFundAccount(fundId1)
        const manager1Before = await getInvestorAccount(fundId1, manager1.address)
        const manager2Before = await getInvestorAccount(fundId1, manager2.address)

        await fund.connect(manager2).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)
        const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)
        const manager2After = await getInvestorAccount(fundId1, manager2.address)

        expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH)
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // tokenAddress
        expect(manager1After.feeTokens[0][1]) 
          .to.equal(BigNumber.from(manager1Before.feeTokens[0][1]).add(fee)) // amount
        expect(manager2After.fundWETH).to.equal(manager2Before.fundWETH.sub(WITHDRAW_AMOUNT))
        expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(investorWithdrawAmount))
      })

      it("manager2 convert ETH -> WETH", async function () {
          const manager2Before = await getInvestorAccount(fundId1, manager2.address)

          await weth9.connect(manager2).deposit({
            from: manager2.address,
            value: WETH_CHARGE_AMOUNT
          })

          const manager2After = await getInvestorAccount(fundId1, manager2.address)
          expect(manager2After.WETH9).to.equal(manager2Before.WETH9.add(WETH_CHARGE_AMOUNT))
      })

      it("manager2 deposit WETH to fund1", async function () {
        const fund1Before = await getFundAccount(fundId1)
        const manager1Before = await getInvestorAccount(fundId1, manager1.address)
        const manager2Before = await getInvestorAccount(fundId1, manager2.address)

        await weth9.connect(manager2).approve(fundAddress, constants.MaxUint256)
        await fund.connect(manager2).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)

        const fund1After = await getFundAccount(fundId1)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)
        const manager2After = await getInvestorAccount(fundId1, manager2.address)

        expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH)
        expect(manager2After.fundWETH).to.equal(manager2Before.fundWETH.add(DEPOSIT_AMOUNT))
        expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(DEPOSIT_AMOUNT))
      })

      it("manager2 withdraw ETH from fund1", async function () {
        const fund1Before = await getFundAccount(fundId1)
        const manager1Before = await getInvestorAccount(fundId1, manager1.address)
        const manager2Before = await getInvestorAccount(fundId1, manager2.address)

        await fund.connect(manager2).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)
        const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)
        const manager2After = await getInvestorAccount(fundId1, manager2.address)

        expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH)
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // tokenAddress
        expect(manager1After.feeTokens[0][1]) 
          .to.equal(BigNumber.from(manager1Before.feeTokens[0][1]).add(fee)) // amount
        expect(manager2After.fundWETH).to.equal(manager2Before.fundWETH.sub(WITHDRAW_AMOUNT))
        expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(investorWithdrawAmount))
      })
    })

    describe("manager2 swap WETH -> UNI, withdraw UNI in fund1", async function () {

      it("#exactInputSingle + withdraw", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const fund1Before = await getFundAccount(fundId1)
        const manager2Before = await getInvestorAccount(fundId1, manager2.address)

        //swap
        const params = exactInputSingleParams(
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await fund.connect(manager1).swap(fundId1, manager2.address, params, { value: 0 })

        const fund1Middle = await getFundAccount(fundId1)
        const manager1Middle = await getInvestorAccount(fundId1, manager1.address)
        const manager2Middle = await getInvestorAccount(fundId1, manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager2Middle.fundUNI).div(2)

        expect(fund1Middle.WETH9).to.equal(fund1Before.WETH9.sub(swapInputAmount))
        expect(manager2Middle.fundWETH).to.equal(manager2Before.fundWETH.sub(swapInputAmount))

        //withdraw uni
        await fund.connect(manager2).withdraw(fundId1, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)
        const manager2After = await getInvestorAccount(fundId1, manager2.address)

        expect(manager2After.fundUNI).to.equal(manager2Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.feeTokens[0][1]).to.equal(manager1Middle.feeTokens[0][1])
        expect(manager1After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund1After.UNI).to.equal(fund1Middle.UNI.sub(investorWithdrawAmount))
      })

      it("#exactOutputSingle + withdraw", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund1Before = await getFundAccount(fundId1)
        const manager2Before = await getInvestorAccount(fundId1, manager2.address)
        const manager1Before = await getInvestorAccount(fundId1, manager1.address)

        const params = exactOutputSingleParams(
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await fund.connect(manager1).swap(fundId1, manager2.address, params, { value: 0 })

        const fund1Middle = await getFundAccount(fundId1)
        const manager2Middle = await getInvestorAccount(fundId1, manager2.address)
        const manager1Middle = await getInvestorAccount(fundId1, manager1.address)

        expect(fund1Middle.UNI).to.equal(fund1Before.UNI.add(swapOutputAmount))
        expect(manager2Middle.fundUNI).to.equal(manager2Before.fundUNI.add(swapOutputAmount))

        //withdraw uni
        await fund.connect(manager2).withdraw(fundId1, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const manager2After = await getInvestorAccount(fundId1, manager2.address)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)

        expect(manager2After.fundUNI).to.equal(manager2Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.feeTokens[0][1]).to.equal(manager1Middle.feeTokens[0][1])
        expect(manager1After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund1After.UNI).to.equal(fund1Middle.UNI.sub(investorWithdrawAmount))
      })

      it("#exactInput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund1Before = await getFundAccount(fundId1)
        const manager2Before = await getInvestorAccount(fundId1, manager2.address)

        const params = exactInputParams(
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await fund.connect(manager1).swap(fundId1, manager2.address, params, { value: 0 })

        const fund1Middle = await getFundAccount(fundId1)
        const manager2Middle = await getInvestorAccount(fundId1, manager2.address)
        const manager1Middle = await getInvestorAccount(fundId1, manager1.address)
        const withdrawAmountUNI = BigNumber.from(manager2Middle.fundUNI).div(2)

        expect(fund1Middle.WETH9).to.equal(fund1Before.WETH9.sub(swapInputAmount))
        expect(manager2Middle.fundWETH).to.equal(manager2Before.fundWETH.sub(swapInputAmount))

        //withdraw uni
        await fund.connect(manager2).withdraw(fundId1, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const manager2After = await getInvestorAccount(fundId1, manager2.address)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)

        expect(manager2After.fundUNI).to.equal(manager2Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.feeTokens[0][1]).to.equal(manager1Middle.feeTokens[0][1])
        expect(manager1After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund1After.UNI).to.equal(fund1Middle.UNI.sub(investorWithdrawAmount))
      })

      it("#exactOutput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund1Before = await getFundAccount(fundId1)
        const manager2Before = await getInvestorAccount(fundId1, manager2.address)
        const manager1Before = await getInvestorAccount(fundId1, manager1.address)

        const params = exactOutputParams(
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await fund.connect(manager1).swap(fundId1, manager2.address, params, { value: 0 })

        const fund1Middle = await getFundAccount(fundId1)
        const manager2Middle = await getInvestorAccount(fundId1, manager2.address)
        const manager1Middle = await getInvestorAccount(fundId1, manager1.address)

        expect(fund1Middle.UNI).to.equal(fund1Before.UNI.add(swapOutputAmount))
        expect(manager2Middle.fundUNI).to.equal(manager2Before.fundUNI.add(swapOutputAmount))

        //withdraw uni
        await fund.connect(manager2).withdraw(fundId1, UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fundId1)
        const manager2After = await getInvestorAccount(fundId1, manager2.address)
        const manager1After = await getInvestorAccount(fundId1, manager1.address)

        expect(manager2After.fundUNI).to.equal(manager2Middle.fundUNI.sub(withdrawAmountUNI))
        expect(manager1After.feeTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.feeTokens[0][1]).to.equal(manager1Middle.feeTokens[0][1])
        expect(manager1After.feeTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.feeTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.feeTokens[1][1]).add(fee)) // amount
        expect(fund1After.UNI).to.equal(fund1Middle.UNI.sub(investorWithdrawAmount))
      })
    })

    describe("manager2's liquidity token in fund1 : ( ETH, UNI )", async function () {

      it("get manager1, manager2 investor tokens in fund1", async function () {
        const manager1Tokens = await fund.connect(manager1).getInvestorTokens(fundId1, manager1.address)
        //console.log(manager1Tokens)

        const manager1Token0 = manager1Tokens[0].tokenAddress
        const manager1Token1 = manager1Tokens[1].tokenAddress
        const manager1Amount0 = manager1Tokens[0].amount
        const manager1Amount1 = manager1Tokens[1].amount
        // console.log('manager1 token0 address :', manager1Token0)
        // console.log('manager1 token0 amount :', manager1Amount0)
        // console.log('manager1 token1 address :', manager1Token1)
        // console.log('manager1 token1 amount :', manager1Amount1)

        const manager2Tokens = await fund.connect(manager1).getInvestorTokens(fundId1, manager2.address)
        // console.log(manager2Tokens)

        const manager2Token0 = manager2Tokens[0].tokenAddress
        const manager2Token1 = manager2Tokens[1].tokenAddress
        const manager2Amount0 = manager2Tokens[0].amount
        const manager2Amount1 = manager2Tokens[1].amount
        // console.log('manager2 token0 address :', manager2Token0)
        // console.log('manager2 token0 amount :', manager2Amount0)
        // console.log('manager2 token1 address :', manager2Token1)
        // console.log('manager2 token1 amount :', manager2Amount1)
      })

      it("mint new position", async function () {
        const params = mintParams(
          fundId1,
          manager2.address,
          UNI,
          WETH9,
          FeeAmount.MEDIUM,
          getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund.connect(manager1).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const params = increaseParams(
          fundId1,
          manager2.address,
          tokenIds[0],
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund.connect(manager1).increaseLiquidity(params, { value: 0 })
      })

      it("LiquidityRouter get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const tokenAmount = await liquidityRouter.connect(manager2).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const params = collectParams(
          fundId1,
          manager2.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund.connect(manager1).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const params = decreaseParams(
          fundId1,
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager1).decreaseLiquidity(params, { value: 0 })
      })

      it("get manager1, manager2 position's token0, token1, amount0, amount1 in fund1", async function () {
        const manager1TokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const manager1TokenAmount = await liquidityRouter.connect(manager1).getPositionTokenAmount(manager1TokenIds[0].toNumber())
        const manager2TokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const manager2TokenAmount = await liquidityRouter.connect(manager1).getPositionTokenAmount(manager2TokenIds[0].toNumber())
        // console.log('manager1 tokenId :', manager1TokenAmount)
        // console.log('manager2 tokenId :', manager2TokenAmount)
      })
    })

    describe("invalid parameter on liquidity request", async function () {

      it("mint new position -> wrong investor", async function () {
        const params = mintParams(
          fundId1,
          investor2.address,
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
        await expect(fund.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("mint new position -> too many token amount", async function () {
        const params = mintParams(
          fundId1,
          manager2.address,
          UNI,
          WETH9,
          FeeAmount.MEDIUM,
          getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          BigNumber.from(200000000),
          BigNumber.from(1000000),
          BigNumber.from(2000000),
          BigNumber.from(10000),
        )
        await expect(fund.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("reset UNI from white list token", async function () {
        await expect(factory.connect(deployer).resetWhiteListToken(UNI))
      })

      it("mint new position -> not white list token", async function () {
        const params = mintParams(
          fundId1,
          manager2.address,
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
        await expect(fund.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("set UNI to white list token", async function () {
        await expect(factory.connect(deployer).setWhiteListToken(UNI))
      })

      it("increase liquidity -> wrong investor", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const params = increaseParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("increase liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = increaseParams(
          fundId1,
          manager2.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("get manager1, manager2 position's token0, token1, amount0, amount1 in fund1", async function () {
        const manager1TokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const manager1TokenAmount = await liquidityRouter.connect(manager1).getPositionTokenAmount(manager1TokenIds[0].toNumber())
        const manager2TokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const manager2TokenAmount = await liquidityRouter.connect(manager1).getPositionTokenAmount(manager2TokenIds[0].toNumber())
        // console.log('manager1 tokenId :', manager1TokenAmount)
        // console.log('manager2 tokenId :', manager2TokenAmount)
      })

      it("increase liquidity -> too many token amount", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        // console.log(tokenIdInfo.liquidity)

        const params = increaseParams(
          fundId1,
          manager2.address,
          tokenIds[0],
          BigNumber.from(300000),
          BigNumber.from(60000000),
          BigNumber.from(1000),
          BigNumber.from(200000),
        )
        await expect(fund.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong investor", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const params = collectParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund.connect(manager1).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong tokenId", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = collectParams(
          fundId1,
          manager2.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund.connect(manager1).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong investor", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const params = decreaseParams(
          fundId1,
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = decreaseParams(
          fundId1,
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many liquidity", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        //console.log(tokenIdInfo.liquidity)

        const params = decreaseParams(
          fundId1,
          manager2.address,
          tokenIds[0],
          20000000,
          BigNumber.from(200000),
          BigNumber.from(1000),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many token amount", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund.connect(manager1).getTokenIds(fundId1, manager2.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        //console.log(tokenIdInfo.liquidity)

        const params = decreaseParams(
          fundId1,
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(200000),
          BigNumber.from(1000),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("fee out -> not manager", async function () {
        await expect(fund.connect(manager2).withdrawFee(fundId1, UNI, 100000)).to.be.reverted
      })

      it("fee out -> too many token amount", async function () {
        const feeTokens = await fund.connect(manager1).getFeeTokens(fundId1)
        await expect(fund.connect(manager1).withdrawFee(fundId1, UNI, 2000000000)).to.be.reverted
      })
    })

    describe("white list token test in fund2", async function () {

      it("can't reset weth9 or dotoli from WhiteListToken", async function () {
        await expect(factory.connect(deployer).resetWhiteListToken(WETH9)).to.be.reverted
        await expect(factory.connect(deployer).resetWhiteListToken(DOTOLI)).to.be.reverted
      })

      it("can't set already white list token", async function () {
        await expect(factory.connect(deployer).setWhiteListToken(UNI)).to.be.reverted
      })

      it("can't reset not white list token ", async function () {
        await expect(factory.connect(deployer).resetWhiteListToken(USDC)).to.be.reverted
      })

      it("success setting white list token when more than minPoolAmount ", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true

        await factory.connect(deployer).resetWhiteListToken(UNI)

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        await factory.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("100.0"))
        await factory.connect(deployer).setWhiteListToken(UNI)

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true
      })

      it("fail setting white list token when less than minPoolAmount ", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true

        await factory.connect(deployer).resetWhiteListToken(UNI)

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        await factory.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("1000000.0"))
        await expect(factory.connect(deployer).setWhiteListToken(UNI)).to.be.reverted

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        await factory.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("1000.0"))
        await factory.connect(deployer).setWhiteListToken(UNI)

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true
      })

      it("fail deposit when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true

        await factory.connect(deployer).resetWhiteListToken(UNI)

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const fund2Before = await getFundAccount(fundId2)
        const manager2Before = await getInvestorAccount(fundId2, manager2.address)

        await uni.connect(manager2).approve(fundAddress, constants.MaxUint256)
        await expect(fund.connect(manager2).deposit(fundId1, UNI, 100000)).to.be.reverted
      })

      it("success withdraw when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
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
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const manager2Before = await getInvestorAccount(fundId2, manager2.address)
        const feeTokens = await fund.connect(manager2).getFeeTokens(fundId2)
        await fund.connect(manager2).withdrawFee(fundId2, UNI, 100000)
        const manager2After = await getInvestorAccount(fundId2, manager2.address)

        expect(manager2After.UNI).to.equal(manager2Before.UNI.add(100000))
      })

      it("success swap in when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
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
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
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
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const params = mintParams(
          fundId2,
          manager1.address,
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
        await expect(fund.connect(manager2).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("fail increase liquidity when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        const params = increaseParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager2).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("success collect fee from liquidity when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const params = collectParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund.connect(manager2).collectPositionFee(params, { value: 0 })
      })

      it("success decrease liquidity when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const tokenIds = await fund.connect(manager2).getTokenIds(fundId2, manager1.address)
        const params = decreaseParams(
          fundId2,
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager2).decreaseLiquidity(params, { value: 0 })
      })

      it("success add other token to white list token when more than min weth volume", async function () {
        const gitcoin = '0xDe30da39c46104798bB5aA3fe8B9e0e1F348163F'
        const livepeer = '0x58b6A8A3302369DAEc383334672404Ee733aB239'
        const theGraph = '0xc944E90C64B2c07662A292be6244BDf05Cda44a7'

        let isWBTCWLT = await factory.connect(manager1).whiteListTokens(WBTC)
        expect(isWBTCWLT).to.be.false
        let isUSDCWLT = await factory.connect(manager1).whiteListTokens(USDC)
        expect(isUSDCWLT).to.be.false
        let isDAIWLT = await factory.connect(manager1).whiteListTokens(DAI)
        expect(isDAIWLT).to.be.false
        let isGitcoinWLT = await factory.connect(manager1).whiteListTokens(gitcoin)
        expect(isGitcoinWLT).to.be.false
        let isLivepeerWLT = await factory.connect(manager1).whiteListTokens(livepeer)
        expect(isLivepeerWLT).to.be.false
        let isTheGraphWLT = await factory.connect(manager1).whiteListTokens(theGraph)
        expect(isTheGraphWLT).to.be.false

        await factory.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("10.0"))
        
        console.log('WBTC')
        await factory.connect(deployer).setWhiteListToken(WBTC)
        console.log('USDC')
        await factory.connect(deployer).setWhiteListToken(USDC)
        console.log('DAI')
        await factory.connect(deployer).setWhiteListToken(DAI)
        console.log('GTC')
        await factory.connect(deployer).setWhiteListToken(gitcoin)
        console.log('LPT')
        await factory.connect(deployer).setWhiteListToken(livepeer)
        console.log('GRT')
        await factory.connect(deployer).setWhiteListToken(theGraph)

        await factory.connect(deployer).resetWhiteListToken(WBTC)
        await factory.connect(deployer).resetWhiteListToken(USDC)
        await factory.connect(deployer).resetWhiteListToken(DAI)
        await factory.connect(deployer).resetWhiteListToken(gitcoin)
        await factory.connect(deployer).resetWhiteListToken(livepeer)
        await factory.connect(deployer).resetWhiteListToken(theGraph)
      })

      it("fail add other token to white list token when less than min weth volume", async function () {
        await factory.connect(deployer).setMinPoolAmount(ethers.utils.parseEther("1000000.0"))

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

        let isWBTCWLT = await factory.connect(manager1).whiteListTokens(WBTC)
        expect(isWBTCWLT).to.be.false
        let isUSDCWLT = await factory.connect(manager1).whiteListTokens(USDC)
        expect(isUSDCWLT).to.be.false
        let isDAIWLT = await factory.connect(manager1).whiteListTokens(DAI)
        expect(isDAIWLT).to.be.false
        let isGitcoinWLT = await factory.connect(manager1).whiteListTokens(gitcoin)
        expect(isGitcoinWLT).to.be.false
        let isLivepeerWLT = await factory.connect(manager1).whiteListTokens(livepeer)
        expect(isLivepeerWLT).to.be.false
        let isTheGraphWLT = await factory.connect(manager1).whiteListTokens(theGraph)
        expect(isTheGraphWLT).to.be.false
        let isMaticWLT = await factory.connect(manager1).whiteListTokens(matic)
        expect(isMaticWLT).to.be.false
        let isAudioWLT = await factory.connect(manager1).whiteListTokens(audio)
        expect(isAudioWLT).to.be.false
        let isNearWLT = await factory.connect(manager1).whiteListTokens(near)
        expect(isNearWLT).to.be.false
        let isLinkWLT = await factory.connect(manager1).whiteListTokens(link)
        expect(isLinkWLT).to.be.false
        let isBatWLT = await factory.connect(manager1).whiteListTokens(bat)
        expect(isBatWLT).to.be.false
        let isOceanWLT = await factory.connect(manager1).whiteListTokens(ocean)
        expect(isOceanWLT).to.be.false

        console.log('WBTC')
        await expect(factory.connect(deployer).setWhiteListToken(WBTC)).to.be.reverted
        console.log('USDC')
        await expect(factory.connect(deployer).setWhiteListToken(USDC)).to.be.reverted
        console.log('DAI')
        await expect(factory.connect(deployer).setWhiteListToken(DAI)).to.be.reverted
        console.log('GTC')
        await expect(factory.connect(deployer).setWhiteListToken(gitcoin)).to.be.reverted
        console.log('LPT')
        await expect(factory.connect(deployer).setWhiteListToken(livepeer)).to.be.reverted
        console.log('GRT')
        await expect(factory.connect(deployer).setWhiteListToken(theGraph)).to.be.reverted
        console.log('MATIC')
        await expect(factory.connect(deployer).setWhiteListToken(matic)).to.be.reverted
        console.log('AUDIO')
        await expect(factory.connect(deployer).setWhiteListToken(audio)).to.be.reverted
        console.log('NEAR')
        await expect(factory.connect(deployer).setWhiteListToken(near)).to.be.reverted
        console.log('LINK')
        await expect(factory.connect(deployer).setWhiteListToken(link)).to.be.reverted
        console.log('BAT')
        await expect(factory.connect(deployer).setWhiteListToken(bat)).to.be.reverted
        console.log('OCEAN')
        await expect(factory.connect(deployer).setWhiteListToken(ocean)).to.be.reverted
      })
    })
  })
})