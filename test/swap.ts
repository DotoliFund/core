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


describe('Swap', () => {

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
        info.connect(who).getFeeTokens(fundId),
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
        info.connect(notInvestor).getFundTokenAmount(fundId, WETH9),
        info.connect(notInvestor).getFundTokenAmount(fundId, UNI),
      ])
      return {
        WETH9: balances[0],
        UNI: balances[1],
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



  describe('manager1', () => {

    it("set UNI to white list token", async function () {
      await expect(setting.connect(deployer).setWhiteListToken(UNI))
    })

    it("check manager is subscribed to fund1", async function () {
      expect(await info.connect(manager1).isSubscribed(manager1.address, fundId1)).to.be.true
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

          //revert if fundId / investor is invalid
          await expect(fund.connect(manager1).swap(
            fundId2,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(manager2).swap(
            fundId1,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(notInvestor).swap(
            fundId1,
            notInvestor.address,
            params, 
            { value: 0 }
          )).to.be.reverted
        })

        it("UNI -> WETH", async function () {
          const swapInputAmount = BigNumber.from(10000000)
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

          //revert if fundId / investor is invalid
          await expect(fund.connect(manager1).swap(
            fundId2,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(manager2).swap(
            fundId1,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(notInvestor).swap(
            fundId1,
            notInvestor.address,
            params, 
            { value: 0 }
          )).to.be.reverted
        })

      })

      describe("#exactOutputSingle", async function () {

        it("WETH -> UNI", async function () {
          const swapOutputAmount = BigNumber.from(10000000)
          const amountInMaximum = BigNumber.from(10000000)

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

          //revert if fundId / investor is invalid
          await expect(fund.connect(manager1).swap(
            fundId2,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(manager2).swap(
            fundId1,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(notInvestor).swap(
            fundId1,
            notInvestor.address,
            params, 
            { value: 0 }
          )).to.be.reverted
        })

        it("UNI -> WETH", async function () {
          const swapOutputAmount = BigNumber.from(1000)
          const amountInMaximum = BigNumber.from(300000)

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

          //revert if fundId / investor is invalid
          await expect(fund.connect(manager1).swap(
            fundId2,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(manager2).swap(
            fundId1,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(notInvestor).swap(
            fundId1,
            notInvestor.address,
            params, 
            { value: 0 }
          )).to.be.reverted
        })
      })

      describe("#exactInput", async function () {

        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9, DAI, UNI]
          const swapInputAmount = BigNumber.from(1000000)
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

          //revert if fundId / investor is invalid
          await expect(fund.connect(manager1).swap(
            fundId2,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(manager2).swap(
            fundId1,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(notInvestor).swap(
            fundId1,
            notInvestor.address,
            params, 
            { value: 0 }
          )).to.be.reverted
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI, DAI, WETH9]
          const swapInputAmount = BigNumber.from(300000)
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

          //revert if fundId / investor is invalid
          await expect(fund.connect(manager1).swap(
            fundId2,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(manager2).swap(
            fundId1,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(notInvestor).swap(
            fundId1,
            notInvestor.address,
            params, 
            { value: 0 }
          )).to.be.reverted
        })

      })

      describe("#exactOutput", async function () {

        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9, DAI, UNI]
          const swapOutputAmount = BigNumber.from(3000000)
          const amountInMaximum = BigNumber.from(1000000)

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

          //revert if fundId / investor is invalid
          await expect(fund.connect(manager1).swap(
            fundId2,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(manager2).swap(
            fundId1,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(notInvestor).swap(
            fundId1,
            notInvestor.address,
            params, 
            { value: 0 }
          )).to.be.reverted
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI, DAI, WETH9]
          const swapOutputAmount = BigNumber.from(1000)
          const amountInMaximum = BigNumber.from(300000)

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
          
          //revert if fundId / investor is invalid
          await expect(fund.connect(manager1).swap(
            fundId2,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(manager2).swap(
            fundId1,
            manager1.address,
            params, 
            { value: 0 }
          )).to.be.reverted
          await expect(fund.connect(notInvestor).swap(
            fundId1,
            notInvestor.address,
            params, 
            { value: 0 }
          )).to.be.reverted
        })
      })
    })

    // if error msg is 'Price slippage check',
    // check amount0 vs amount1 ratio. 
    // (2022/10/31) UNI vs ETH => 200 : 1 (OK)
    describe("liquidity manager1's token : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
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

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).mintNewPosition(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).mintNewPosition(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).mintNewPosition(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("increase liquidity", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = increaseParams(
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager1).increaseLiquidity(
          fundId1,
          manager1.address,
          params, 
          { value: 0 }
        )

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).increaseLiquidity(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).increaseLiquidity(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).increaseLiquidity(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("get position's token0, token1, amount0, amount1 by LiquidityRouter", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const tokenAmount = await oracle.connect(manager1).getPositionTokenAmount(tokenIds[0])
      })

      it("collect position fee", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = collectParams(
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund.connect(manager1).collectPositionFee(
          fundId1,
          manager1.address,
          params, 
          { value: 0 }
        )

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).collectPositionFee(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).collectPositionFee(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).collectPositionFee(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("decrease liquidity", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = decreaseParams(
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager1).decreaseLiquidity(
          fundId1,
          manager1.address,
          params, 
          { value: 0 }
        )

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).decreaseLiquidity(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).decreaseLiquidity(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).decreaseLiquidity(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })
    })
  })

  describe('manager1 + investor1', () => {

    it("set UNI to white list token", async function () {
      await expect(setting.connect(deployer).setWhiteListToken(UNI))
    })

    it("investor1 not subscribed to fund1 yet", async function () {
      expect(await info.connect(investor1).isSubscribed(investor1.address, fundId1)).to.be.false
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
      await info.connect(investor1).subscribe(fundId1)
    })

    it("check investor1 is subscribed", async function () {
      const isSubscribed = await info.connect(investor1).isSubscribed(investor1.address, fundId1)
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
      await expect(setting.connect(deployer).setWhiteListToken(UNI))
    })

    describe("investor1's swap must be failed", async function () {

      it("#exactInputSingle", async function () {
        const swapInputAmount = BigNumber.from(100000000)
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
        const swapOutputAmount = BigNumber.from(30000000)
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
        const swapInputAmount = BigNumber.from(1000000)
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
        const swapOutputAmount = BigNumber.from(30000000)
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

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).swap(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).swap(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor2).swap(
          fundId1,
          investor2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).swap(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("#exactOutputSingle + withdraw", async function () {
        const swapOutputAmount = BigNumber.from(3000000)
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

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).swap(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).swap(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor2).swap(
          fundId1,
          investor2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).swap(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("#exactInput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(100000)
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

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).swap(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).swap(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor2).swap(
          fundId1,
          investor2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).swap(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("#exactOutput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(3000000)
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

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).swap(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).swap(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor2).swap(
          fundId1,
          investor2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).swap(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })
    })

    // if error msg is 'Price slippage check',
    // check amount0 vs amount1 ratio. 
    // (2022/10/31) UNI vs ETH => 200 : 1 (OK)
    describe("investor1's liquidity token : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintParams(
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
        await fund.connect(manager1).mintNewPosition(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).mintNewPosition(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).mintNewPosition(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor2).mintNewPosition(
          fundId1,
          investor2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).mintNewPosition(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("increase liquidity", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = increaseParams(
          tokenIds[0],
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund.connect(manager1).increaseLiquidity(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).increaseLiquidity(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor1).increaseLiquidity(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor2).increaseLiquidity(
          fundId1,
          investor2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).increaseLiquidity(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("LiquidityRouter get token0, token1, amount0, amount1", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
        const tokenAmount = await oracle.connect(manager1).getPositionTokenAmount(tokenIds[0])
      })

      it("collect position fee", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = collectParams(
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund.connect(manager1).collectPositionFee(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).collectPositionFee(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor2).collectPositionFee(
          fundId1,
          investor2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).collectPositionFee(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("decrease liquidity", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = decreaseParams(
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund.connect(manager1).decreaseLiquidity(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )

        //revert if fundId / investor is invalid
        await expect(fund.connect(manager2).decreaseLiquidity(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(investor2).decreaseLiquidity(
          fundId1,
          investor2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
        await expect(fund.connect(notInvestor).decreaseLiquidity(
          fundId1,
          notInvestor.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })
    })

    describe("invalid parameter on liquidity request", async function () {

      it("mint new position -> wrong investor", async function () {
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
        await expect(fund.connect(manager1).mintNewPosition(
          fundId1,
          manager2.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("get manager1, investor1 position's token0, token1, amount0, amount1 in fund1", async function () {
        const manager1TokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const manager1TokenAmount = await oracle.connect(manager1).getPositionTokenAmount(manager1TokenIds[0])
        const investor1TokenIds = await info.connect(investor1).getTokenIds(fundId1, investor1.address)
        const investor1TokenAmount = await oracle.connect(investor1).getPositionTokenAmount(investor1TokenIds[0])
        // console.log('manager1 tokenId :', manager1TokenAmount)
        // console.log('investor1 tokenId :', investor1TokenAmount)
      })

      it("get manager1, investor1 investor tokens in fund1", async function () {
        const manager1Tokens = await info.connect(manager1).getInvestorTokens(fundId1, manager1.address)
        const manager1Token0 = manager1Tokens[0].tokenAddress
        const manager1Token1 = manager1Tokens[1].tokenAddress
        const manager1Amount0 = manager1Tokens[0].amount
        const manager1Amount1 = manager1Tokens[1].amount
        // console.log('manager1 token0 address :', manager1Token0)
        // console.log('manager1 token0 amount :', manager1Amount0)
        // console.log('manager1 token1 address :', manager1Token1)
        // console.log('manager1 token1 amount :', manager1Amount1)

        const investor1Tokens = await info.connect(investor1).getInvestorTokens(fundId1, investor1.address)
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
          UNI,
          WETH9,
          FeeAmount.MEDIUM,
          getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          BigNumber.from(2000000000000),
          BigNumber.from(10000000000),
          BigNumber.from(20000000),
          BigNumber.from(100000),
        )
        await expect(fund.connect(manager1).mintNewPosition(
          fundId1,
          manager1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("reset UNI from white list token", async function () {
        let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true

        await setting.connect(deployer).resetWhiteListToken(UNI)

        isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

      })

      it("mint new position -> not white list token", async function () {
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
        await expect(fund.connect(manager1).mintNewPosition(
          fundId1,
          manager1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("set UNI to white list token", async function () {
        let isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        await setting.connect(deployer).setWhiteListToken(UNI)

        isUNIWhiteListToken = await setting.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true
      })

      it("increase liquidity -> wrong investor", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = increaseParams(
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).increaseLiquidity(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("increase liquidity -> wrong tokenId", async function () {
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
          manager1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("increase liquidity -> too many token amount", async function () {
        // for debug
        // const investor1Tokens = await info.connect(investor1).getInvestorTokens(fundId1, investor1.address)
        // const investor1Token0 = investor1Tokens[0].tokenAddress
        // const investor1Token1 = investor1Tokens[1].tokenAddress
        // const investor1Amount0 = investor1Tokens[0].amount
        // const investor1Amount1 = investor1Tokens[1].amount
        // console.log('investor1 token0 address :', investor1Token0)
        // console.log('investor1 token0 amount :', investor1Amount0)
        // console.log('investor1 token1 address :', investor1Token1)
        // console.log('investor1 token1 amount :', investor1Amount1)

        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = increaseParams(
          tokenIds[0],
          BigNumber.from(600000000),
          BigNumber.from(3000000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await expect(fund.connect(manager1).increaseLiquidity(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("collect position fee -> wrong investor", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = collectParams(
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund.connect(manager1).collectPositionFee(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("collect position fee -> wrong tokenId", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = collectParams(
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund.connect(manager1).collectPositionFee(
          fundId1,
          manager1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("decrease liquidity -> wrong investor", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const params = decreaseParams(
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(
          fundId1,
          investor1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("decrease liquidity -> wrong tokenId", async function () {
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
        const params = decreaseParams(
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(
          fundId1,
          manager1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("decrease liquidity -> too many liquidity", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        //console.log(tokenIdInfo.liquidity)

        const params = decreaseParams(
          tokenIds[0],
          3000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(
          fundId1,
          manager1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("decrease liquidity -> too many token amount", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        //console.log(tokenIdInfo.liquidity)

        const params = decreaseParams(
          tokenIds[0],
          1000,
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await expect(fund.connect(manager1).decreaseLiquidity(
          fundId1,
          manager1.address,
          params, 
          { value: 0 }
        )).to.be.reverted
      })

      it("fee out -> not manager", async function () {
        await expect(fund.connect(investor1).withdrawFee(fundId1, UNI, 100000)).to.be.reverted
      })

      it("fee out -> too many token amount", async function () {
        const feeTokens = await info.connect(manager1).getFeeTokens(fundId1)
        await expect(fund.connect(manager1).withdrawFee(fundId1, UNI, 2000000000)).to.be.reverted
      })
    })
  })

  describe('manager1 + manager2', () => {

    it("manager1 not subscribed to manager2 ", async function () {
      expect(await info.connect(manager1).isSubscribed(manager1.address, fundId2)).to.be.false
    })

    it("manager2 not subscribed to manager1", async function () {
      expect(await info.connect(manager2).isSubscribed(manager2.address, fundId1)).to.be.false
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
      await info.connect(manager1).subscribe(fundId2)
    })

    it("manager2 subscribe to manager1", async function () {
      await info.connect(manager2).subscribe(fundId1)
    })

    it("check manager1, manager2 subscribed eash other", async function () {
      expect(await info.connect(manager1).isSubscribed(manager1.address, fundId2)).to.be.true
      expect(await info.connect(manager2).isSubscribed(manager2.address, fundId1)).to.be.true
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
  })
})