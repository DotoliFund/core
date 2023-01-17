import { Wallet, constants, BigNumber, ContractTransaction, Contract } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { LiquidityOracle } from '../typechain-types/contracts/LiquidityOracle'
import { DotoliFactory } from '../typechain-types/contracts/DotoliFactory'
import { DotoliFund } from '../typechain-types/contracts/DotoliFund'
import { getCreate2Address } from './shared/utilities'
import { encodePath } from './shared/path'
import { 
  exactInputSingleParams,
  exactOutputSingleParams,
  exactInputParams,
  exactOutputParams
} from './shared/swap'
import { 
  mintNewPositionParams,
  increaseLiquidityParams,
  collectPositionFeeParams,
  decreaseLiquidityParams
} from './shared/liquidity'
import { 
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

  let liquidityOracleContractAddress: string
  let factoryContractAddress: string
  let fundContractAddress: string

  let fund1Address: string
  let fund2Address: string

  let liquidityOracle: Contract
  let factory: Contract
  let fund1: Contract
  let fund2: Contract
  let weth9: Contract
  let uni: Contract

  let getManagerAccount: (
    who: string
  ) => Promise<{
    weth9: BigNumber,
    uni: BigNumber,
    fund1WETH: BigNumber,
    fund1UNI: BigNumber,
    fund2WETH: BigNumber,
    fund2UNI: BigNumber,
    rewardTokens : string[],
  }>

  let getInvestorAccount: (
    who: string
  ) => Promise<{
    weth9: BigNumber,
    uni: BigNumber,
    fund1WETH: BigNumber,
    fund1UNI: BigNumber,
    fund2WETH: BigNumber,
    fund2UNI: BigNumber,
    rewardTokens : string[],
  }>

  let getFundAccount: (
    who: string
  ) => Promise<{
    weth9: BigNumber,
    uni: BigNumber,
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

    getManagerAccount = async (who: string) => {
      const balances = await Promise.all([
        weth9.balanceOf(who),
        uni.balanceOf(who),
        fund1.connect(who).getInvestorTokenAmount(who, WETH9),
        fund1.connect(who).getInvestorTokenAmount(who, UNI),
        fund2.connect(who).getInvestorTokenAmount(who, WETH9),
        fund2.connect(who).getInvestorTokenAmount(who, UNI),
        who == manager1.address ? fund1.connect(who).getFeeTokens() : who == manager2.address ? fund2.connect(who).getFeeTokens() : [],
      ])
      return {
        weth9: balances[0],     // const manager1Before = getManagerAccount(manager1) => manager1Before.weth9
        uni: balances[1],       // const investor1Before = getManagerAccount(investor1) => investor1Before.uni
        fund1WETH: balances[2], // const manager1After = getManagerAccount(manager1)  => manager1After.fund1WETH
        fund1UNI: balances[3],  // const investor1After = getManagerAccount(investor1)  => investor1After.fund1UNI
        fund2WETH: balances[4], // const investor1Before = getManagerAccount(investor1)  => investor1Before.fund1WETH
        fund2UNI: balances[5],
        rewardTokens: balances[6],
      }
    }

    getInvestorAccount = async (who: string) => {
      const balances = await Promise.all([
        weth9.balanceOf(who),
        uni.balanceOf(who),
        fund1.connect(who).getInvestorTokenAmount(who, WETH9),
        fund1.connect(who).getInvestorTokenAmount(who, UNI),
        fund2.connect(who).getInvestorTokenAmount(who, WETH9),
        fund2.connect(who).getInvestorTokenAmount(who, UNI),
        who == manager1.address ? fund1.connect(who).getFeeTokens() : who == manager2.address ? fund2.connect(who).getFeeTokens() : [],
      ])
      return {
        weth9: balances[0],     // const manager1Before = getInvestorAccount(manager1) => manager1Before.weth9
        uni: balances[1],       // const investor1Before = getInvestorAccount(investor1) => investor1Before.uni
        fund1WETH: balances[2], // const manager1After = getInvestorAccount(manager1)  => manager1After.fund1WETH
        fund1UNI: balances[3],  // const investor1After = getInvestorAccount(investor1)  => investor1After.fund1UNI
        fund2WETH: balances[4], // const investor1Before = getInvestorAccount(investor1)  => investor1Before.fund1WETH
        fund2UNI: balances[5],
        rewardTokens: balances[6],
      }
    }

    getFundAccount = async (who: string) => {
      const balances = await Promise.all([
        weth9.balanceOf(who),
        uni.balanceOf(who),
      ])
      return {
        weth9: balances[0],     // const fund1Before = getFundAccount(fund1) => fund1Before.weth9
        uni: balances[1],       // const fund2Before = getFundAccount(fund2) => fund2Before.uni 
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
    liquidityOracleContractAddress = Oracle.address
    liquidityOracle = await ethers.getContractAt("LiquidityOracle", liquidityOracleContractAddress)
  })

  before("Deploy DotoliFactory Contract", async function () {
    const DotoliFactory = await ethers.getContractFactory("DotoliFactory")
    const Factory = await DotoliFactory.connect(deployer).deploy(WETH9, DOTOLI)
    await Factory.deployed()
    factoryContractAddress = Factory.address
    factory = await ethers.getContractAt("DotoliFactory", factoryContractAddress)
  })

  before("Deploy DotoliFund Contract", async function () {
    const DotoliFund = await ethers.getContractFactory("DotoliFund")
    const Fund = await DotoliFund.connect(deployer).deploy()
    await Fund.deployed()
    fundContractAddress = Fund.address
  })

  it("create 1st fund", async function () {
    await factory.connect(manager1).createFund()
    const fundBytecode = (await ethers.getContractFactory('DotoliFund')).bytecode
    const expectedFundAddress = getCreate2Address(factoryContractAddress, manager1.address, fundBytecode)
    const savedFundAddress = await factory.connect(manager1).getFundByManager(manager1.address)
    expect(savedFundAddress).to.equal(expectedFundAddress)
    fund1Address = savedFundAddress
    fund1 = await ethers.getContractAt("DotoliFund", fund1Address)
  })

  it("create 2nd fund", async function () {
    await factory.connect(manager2).createFund()
    const fundBytecode = (await ethers.getContractFactory('DotoliFund')).bytecode
    const expectedFundAddress = getCreate2Address(factoryContractAddress, manager2.address, fundBytecode)
    const savedFundAddress = await factory.connect(manager2).getFundByManager(manager2.address)
    expect(savedFundAddress).to.equal(expectedFundAddress)
    fund2Address = savedFundAddress
    fund2 = await ethers.getContractAt("DotoliFund", fund2Address)
  })

  describe('manager1', () => {

    it("set UNI to white list token", async function () {
      await expect(factory.connect(deployer).setWhiteListToken(UNI))
    })

    it("check correct factory", async function () {
      fund1 = await ethers.getContractAt("DotoliFund", fund1Address)
      expect(await fund1.connect(manager1).factory()).to.equal(factoryContractAddress)
    })

    it("check correct manager", async function () {
      expect(await fund1.connect(manager1).manager()).to.equal(manager1.address)
    })

    it("convert ETH to WETH", async function () {
      const manager1Before = await getManagerAccount(manager1.address)
      await weth9.connect(manager1).deposit({
        from: manager1.address,
        value: WETH_CHARGE_AMOUNT
      })
      const manager1After = await getManagerAccount(manager1.address)
      expect(manager1After.weth9).to.equal(manager1Before.weth9.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH to fund1", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      await manager1.sendTransaction({
        to: fund1Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })

      const manager1After = await getManagerAccount(manager1.address)
      const fund1After = await getFundAccount(fund1.address)

      expect(manager1After.fund1WETH).to.equal(DEPOSIT_AMOUNT)
      expect(manager1After.rewardTokens).to.be.empty
      expect(fund1After.weth9).to.equal(fund1Before.weth9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw ETH", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      const manager1Before = await getManagerAccount(manager1.address)

      await fund1.connect(manager1).withdraw(WETH9, WITHDRAW_AMOUNT)

      const fund1After = await getFundAccount(fund1.address)
      const manager1After = await getManagerAccount(manager1.address)

      expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.rewardTokens).to.be.empty
      expect(fund1After.weth9).to.equal(fund1Before.weth9.sub(WITHDRAW_AMOUNT))
    })

    it("deposit WETH", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      const manager1Before = await getManagerAccount(manager1.address)

      await weth9.connect(manager1).approve(fund1Address, constants.MaxUint256)
      await fund1.connect(manager1).deposit(WETH9, DEPOSIT_AMOUNT)

      const fund1After = await getFundAccount(fund1.address)
      const manager1After = await getManagerAccount(manager1.address)

      expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH.add(DEPOSIT_AMOUNT))
      expect(manager1After.rewardTokens).to.be.empty
      expect(fund1After.weth9).to.equal(fund1Before.weth9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw WETH", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      const manager1Before = await getManagerAccount(manager1.address)

      await fund1.connect(manager1).withdraw(WETH9, WITHDRAW_AMOUNT)

      const fund1After = await getFundAccount(fund1.address)
      const manager1After = await getManagerAccount(manager1.address)

      expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.rewardTokens).to.be.empty
      expect(fund1After.weth9).to.equal(fund1Before.weth9.sub(WITHDRAW_AMOUNT))
    })


    describe('swap', () => {

      describe("#exactInputSingle", async function () {

        it("WETH -> UNI", async function () {
          const swapInputAmount = BigNumber.from(1000000)
          const amountOutMinimum = BigNumber.from(1)

          const fund1Before = await getFundAccount(fund1.address)
          const manager1Before = await getManagerAccount(manager1.address)

          const params = exactInputSingleParams(
            manager1.address,
            WETH9,
            UNI,
            swapInputAmount,
            amountOutMinimum,
            BigNumber.from(0)
          )
          await fund1.connect(manager1).swap(params, { value: 0 })
          
          const fund1After = await getFundAccount(fund1.address)
          const manager1After = await getManagerAccount(manager1.address)

          expect(fund1After.weth9).to.equal(fund1Before.weth9.sub(swapInputAmount))
          expect(fund1After.uni).to.be.above(fund1Before.uni)
          expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH.sub(swapInputAmount))
          expect(manager1After.fund1UNI).to.be.above(manager1Before.fund1UNI)
        })

        it("UNI -> WETH", async function () {
          const swapInputAmount = BigNumber.from(1000000)
          const amountOutMinimum = BigNumber.from(1)

          const fund1Before = await getFundAccount(fund1.address)
          const manager1Before = await getManagerAccount(manager1.address)

          const params = exactInputSingleParams(
            manager1.address,
            UNI,
            WETH9, 
            swapInputAmount, 
            amountOutMinimum, 
            BigNumber.from(0)
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const fund1After = await getFundAccount(fund1.address)
          const manager1After = await getManagerAccount(manager1.address)

          expect(fund1After.weth9).to.be.above(fund1Before.weth9)
          expect(fund1After.uni).to.equal(fund1Before.uni.sub(swapInputAmount))
          expect(manager1After.fund1WETH).to.be.above(manager1Before.fund1WETH)
          expect(manager1After.fund1UNI).to.equal(manager1Before.fund1UNI.sub(swapInputAmount))
        })

      })

      describe("#exactOutputSingle", async function () {

        it("WETH -> UNI", async function () {
          const swapOutputAmount = BigNumber.from(1000000)
          const amountInMaximum = BigNumber.from(100000)

          const fund1Before = await getFundAccount(fund1.address)
          const manager1Before = await getManagerAccount(manager1.address)

          const params = exactOutputSingleParams(
            manager1.address,
            WETH9, 
            UNI, 
            swapOutputAmount, 
            amountInMaximum, 
            BigNumber.from(0)
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const fund1After = await getFundAccount(fund1.address)
          const manager1After = await getManagerAccount(manager1.address)

          expect(fund1After.weth9).to.be.below(fund1Before.weth9)
          expect(fund1After.uni).to.equal(fund1Before.uni.add(swapOutputAmount))
          expect(manager1After.fund1WETH).to.be.below(manager1Before.fund1WETH)
          expect(manager1After.fund1UNI).to.equal(manager1Before.fund1UNI.add(swapOutputAmount))
        })

        it("UNI -> WETH", async function () {
          const swapOutputAmount = BigNumber.from(100000)
          const amountInMaximum = BigNumber.from(30000000)

          const fund1Before = await getFundAccount(fund1.address)
          const manager1Before = await getManagerAccount(manager1.address)

          const params = exactOutputSingleParams(
            manager1.address,
            UNI,
            WETH9, 
            swapOutputAmount, 
            amountInMaximum, 
            BigNumber.from(0)
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const fund1After = await getFundAccount(fund1.address)
          const manager1After = await getManagerAccount(manager1.address)

          expect(fund1After.weth9).to.equal(fund1Before.weth9.add(swapOutputAmount))
          expect(fund1After.uni).to.be.below(fund1Before.uni)
          expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH.add(swapOutputAmount))
          expect(manager1After.fund1UNI).to.be.below(manager1Before.fund1UNI)
        })

      })

      describe("#exactInput", async function () {

        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9, DAI, UNI]
          const swapInputAmount = BigNumber.from(10000)
          const amountOutMinimum = BigNumber.from(1)

          const fund1Before = await getFundAccount(fund1.address)
          const manager1Before = await getManagerAccount(manager1.address)

          const params = exactInputParams(
            manager1.address,
            tokens,
            swapInputAmount,
            amountOutMinimum
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const fund1After = await getFundAccount(fund1.address)
          const manager1After = await getManagerAccount(manager1.address)

          expect(fund1After.weth9).to.equal(fund1Before.weth9.sub(swapInputAmount))
          expect(fund1After.uni).to.be.above(fund1Before.uni)
          expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH.sub(swapInputAmount))
          expect(manager1After.fund1UNI).to.be.above(manager1Before.fund1UNI)
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI, DAI, WETH9]
          const swapInputAmount = BigNumber.from(3000000)
          const amountOutMinimum = BigNumber.from(1)

          const fund1Before = await getFundAccount(fund1.address)
          const manager1Before = await getManagerAccount(manager1.address)

          const params = exactInputParams(
            manager1.address,
            tokens,
            swapInputAmount,
            amountOutMinimum
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const fund1After = await getFundAccount(fund1.address)
          const manager1After = await getManagerAccount(manager1.address)

          expect(fund1After.weth9).to.be.above(fund1Before.weth9)
          expect(fund1After.uni).to.equal(fund1Before.uni.sub(swapInputAmount))
          expect(manager1After.fund1WETH).to.be.above(manager1Before.fund1WETH)
          expect(manager1After.fund1UNI).to.equal(manager1Before.fund1UNI.sub(swapInputAmount))
        })

      })

      describe("#exactOutput", async function () {

        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9, DAI, UNI]
          const swapOutputAmount = BigNumber.from(1000000)
          const amountInMaximum = BigNumber.from(100000)

          const fund1Before = await getFundAccount(fund1.address)
          const manager1Before = await getManagerAccount(manager1.address)

          const params = exactOutputParams(
            manager1.address,
            tokens,
            swapOutputAmount,
            amountInMaximum
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const fund1After = await getFundAccount(fund1.address)
          const manager1After = await getManagerAccount(manager1.address)

          expect(fund1After.weth9).to.be.below(fund1Before.weth9)
          expect(fund1After.uni).to.equal(fund1Before.uni.add(swapOutputAmount))
          expect(manager1After.fund1WETH).to.be.below(manager1Before.fund1WETH)
          expect(manager1After.fund1UNI).to.equal(manager1Before.fund1UNI.add(swapOutputAmount))
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI, DAI, WETH9]
          const swapOutputAmount = BigNumber.from(10000)
          const amountInMaximum = BigNumber.from(3000000)

          const fund1Before = await getFundAccount(fund1.address)
          const manager1Before = await getManagerAccount(manager1.address)

          const params = exactOutputParams(
            manager1.address,
            tokens,
            swapOutputAmount,
            amountInMaximum,
            fund1Address
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const fund1After = await getFundAccount(fund1.address)
          const manager1After = await getManagerAccount(manager1.address)

          expect(fund1After.weth9).to.equal(fund1Before.weth9.add(swapOutputAmount))
          expect(fund1After.uni).to.be.below(fund1Before.uni)
          expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH.add(swapOutputAmount))
          expect(manager1After.fund1UNI).to.be.below(manager1Before.fund1UNI)
        })
      })
    })

    // if error msg is 'Price slippage check',
    // check amount0 vs amount1 ratio. 
    // (2022/10/31) UNI vs ETH => 200 : 1 (OK)
    describe("liquidity manager1's token : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintNewPositionParams(
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
        await fund1.connect(manager1).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const params = increaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund1.connect(manager1).increaseLiquidity(params, { value: 0 })
      })

      it("get position's token0, token1, amount0, amount1 by liquidityOracle", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const tokenAmount = await liquidityOracle.connect(manager1).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const params = collectPositionFeeParams(
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund1.connect(manager1).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })
      })
    })
  })

  describe('manager1 + investor1', () => {

    it("set UNI to white list token", async function () {
      await expect(factory.connect(deployer).setWhiteListToken(UNI))
    })

    it("investor1 not subscribed to fund1 yet", async function () {
      expect(await factory.connect(investor1).isSubscribed(investor1.address, fund1Address)).to.be.false
    })

    it("investor1 fail to deposit, withdraw, swap", async function () {
      await expect(investor1.sendTransaction({
        to: fund1Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })).to.be.reverted

      await weth9.connect(investor1).approve(fund1Address, constants.MaxUint256)
      
      //deposit, withdraw
      await expect(fund1.connect(investor1).deposit(WETH9, DEPOSIT_AMOUNT)).to.be.reverted
      await expect(fund1.connect(investor1).withdraw(WETH9, WITHDRAW_AMOUNT)).to.be.reverted
      //swap exactInput
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = BigNumber.from(10000)
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        manager1.address,
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await expect(fund1.connect(investor1).swap(params, { value: 0 })).to.be.reverted
    })

    it("investor1 subscribe to fund1", async function () {
      await factory.connect(investor1).subscribe(fund1Address)
    })

    it("check investor1 subscribed", async function () {
      const isRegistered = await factory.connect(investor1).isSubscribed(investor1.address, fund1Address)
      expect(isRegistered).to.be.true
    })

    it("convert ETH -> WETH", async function () {
        const investor1Before = await getInvestorAccount(investor1.address)

        await weth9.connect(investor1).deposit({
          from: investor1.address,
          value: WETH_CHARGE_AMOUNT
        })

        const investor1After = await getInvestorAccount(investor1.address)
        expect(investor1After.weth9).to.equal(investor1Before.weth9.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH to fund1", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      const investor1Before = await getInvestorAccount(investor1.address)

      await investor1.sendTransaction({
        to: fund1Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })

      const fund1After = await getFundAccount(fund1.address)
      const investor1After = await getInvestorAccount(investor1.address)

      expect(investor1After.rewardTokens).to.be.empty
      expect(investor1After.fund1WETH).to.equal(investor1Before.fund1WETH.add(DEPOSIT_AMOUNT))
      expect(fund1After.weth9).to.equal(fund1Before.weth9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw ETH from fund1", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      const investor1Before = await getInvestorAccount(investor1.address)

      await fund1.connect(investor1).withdraw(WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const fund1After = await getFundAccount(fund1.address)
      const investor1After = await getInvestorAccount(investor1.address)
      const manager1After = await getManagerAccount(manager1.address)

      expect(investor1After.fund1WETH).to.equal(investor1Before.fund1WETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // tokenAddress
      expect(manager1After.rewardTokens[0][1]).to.equal(fee) // amount
      expect(fund1After.weth9).to.equal(fund1Before.weth9.sub(investorWithdrawAmount))
    })

    it("deposit WETH to fund1", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      const investor1Before = await getInvestorAccount(investor1.address)
      const manager1Before = await getManagerAccount(manager1.address)

      await weth9.connect(investor1).approve(fund1Address, constants.MaxUint256)
      await fund1.connect(investor1).deposit(WETH9, DEPOSIT_AMOUNT)

      const fund1After = await getFundAccount(fund1.address)
      const investor1After = await getInvestorAccount(investor1.address)
      const manager1After = await getManagerAccount(manager1.address)

      expect(investor1After.fund1WETH).to.equal(investor1Before.fund1WETH.add(DEPOSIT_AMOUNT))
      expect(manager1After.rewardTokens[0][0]).to.equal(manager1Before.rewardTokens[0][0]) // tokenAddress
      expect(manager1After.rewardTokens[0][1]).to.equal(manager1Before.rewardTokens[0][1]) // amount
      expect(fund1After.weth9).to.equal(fund1Before.weth9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw WETH from fund1", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      const investor1Before = await getInvestorAccount(investor1.address)
      const manager1Before = await getManagerAccount(manager1.address)

      await fund1.connect(investor1).withdraw(WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const fund1After = await getFundAccount(fund1.address)
      const investor1After = await getInvestorAccount(investor1.address)
      const manager1After = await getManagerAccount(manager1.address)

      expect(investor1After.fund1WETH).to.equal(investor1Before.fund1WETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // tokenAddress
      expect(manager1After.rewardTokens[0][1]) 
        .to.equal(BigNumber.from(manager1Before.rewardTokens[0][1]).add(fee)) // amount
      expect(fund1After.weth9).to.equal(fund1Before.weth9.sub(investorWithdrawAmount))
    })

    it("set UNI to white list token", async function () {
      await expect(factory.connect(deployer).setWhiteListToken(UNI))
    })

    describe("investor1's swap must be failed", async function () {

      it("#exactInputSingle", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputSingleParams(
          investor1.address,
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await expect(fund1.connect(investor1).swap(params, { value: 0 })).to.be.reverted
      })

      it("#exactOutputSingle", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)

        const params = exactOutputSingleParams(
          investor1.address,
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await expect(fund1.connect(investor1).swap(params, { value: 0 })).to.be.reverted
      })

      it("#exactInput", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputParams(
          investor1.address,
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await expect(fund1.connect(investor1).swap(params, { value: 0 })).to.be.reverted
      })

      it("#exactOutput", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)

        const params = exactOutputParams(
          investor1.address,
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await expect(fund1.connect(investor1).swap(params, { value: 0 })).to.be.reverted
      })
    })

    describe("investor1 swap WETH -> UNI, withdraw UNI", async function () {

      it("#exactInputSingle + withdraw", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const fund1Before = await getFundAccount(fund1.address)
        const investor1Before = await getInvestorAccount(investor1.address)

        //swap
        const params = exactInputSingleParams(
          investor1.address,
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const investor1Middle = await getInvestorAccount(investor1.address)
        const manager1Middle = await getManagerAccount(manager1.address)
        const withdrawAmountUNI = BigNumber.from(investor1Middle.fund1UNI).div(2)

        expect(fund1Middle.weth9).to.equal(fund1Before.weth9.sub(swapInputAmount))
        expect(investor1Middle.fund1WETH).to.equal(investor1Before.fund1WETH.sub(swapInputAmount))

        //withdraw uni
        await fund1.connect(investor1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const investor1After = await getInvestorAccount(investor1.address)
        const manager1After = await getManagerAccount(manager1.address)

        expect(investor1After.fund1UNI).to.equal(investor1Middle.fund1UNI.sub(withdrawAmountUNI))
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.rewardTokens[0][1]).to.equal(manager1Middle.rewardTokens[0][1])
        expect(manager1After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.rewardTokens[1][1]).to.equal(fee)
        expect(fund1After.uni).to.equal(fund1Middle.uni.sub(investorWithdrawAmount))
      })

      it("#exactOutputSingle + withdraw", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund1Before = await getFundAccount(fund1.address)
        const investor1Before = await getInvestorAccount(investor1.address)
        const manager1Before = await getManagerAccount(manager1.address)

        const params = exactOutputSingleParams(
          investor1.address,
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const investor1Middle = await getInvestorAccount(investor1.address)
        const manager1Middle = await getManagerAccount(manager1.address)

        expect(fund1Middle.uni).to.equal(fund1Before.uni.add(swapOutputAmount))
        expect(investor1Middle.fund1UNI).to.equal(investor1Before.fund1UNI.add(swapOutputAmount))

        //withdraw uni
        await fund1.connect(investor1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const investor1After = await getInvestorAccount(investor1.address)
        const manager1After = await getManagerAccount(manager1.address)

        expect(investor1After.fund1UNI).to.equal(investor1Middle.fund1UNI.sub(withdrawAmountUNI))
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.rewardTokens[0][1]).to.equal(manager1Middle.rewardTokens[0][1])
        expect(manager1After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund1After.uni).to.equal(fund1Middle.uni.sub(investorWithdrawAmount))
      })

      it("#exactInput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund1Before = await getFundAccount(fund1.address)
        const investor1Before = await getInvestorAccount(investor1.address)

        const params = exactInputParams(
          investor1.address,
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const investor1Middle = await getInvestorAccount(investor1.address)
        const manager1Middle = await getManagerAccount(manager1.address)
        const withdrawAmountUNI = BigNumber.from(investor1Middle.fund1UNI).div(2)

        expect(fund1Middle.weth9).to.equal(fund1Before.weth9.sub(swapInputAmount))
        expect(investor1Middle.fund1WETH).to.equal(investor1Before.fund1WETH.sub(swapInputAmount))

        //withdraw uni
        await fund1.connect(investor1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const investor1After = await getInvestorAccount(investor1.address)
        const manager1After = await getManagerAccount(manager1.address)

        expect(investor1After.fund1UNI).to.equal(investor1Middle.fund1UNI.sub(withdrawAmountUNI))
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.rewardTokens[0][1]).to.equal(manager1Middle.rewardTokens[0][1])
        expect(manager1After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund1After.uni).to.equal(fund1Middle.uni.sub(investorWithdrawAmount))
      })

      it("#exactOutput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund1Before = await getFundAccount(fund1.address)
        const investor1Before = await getInvestorAccount(investor1.address)
        const manager1Before = await getManagerAccount(manager1.address)

        const params = exactOutputParams(
          investor1.address,
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const investor1Middle = await getInvestorAccount(investor1.address)
        const manager1Middle = await getManagerAccount(manager1.address)

        expect(fund1Middle.uni).to.equal(fund1Before.uni.add(swapOutputAmount))
        expect(investor1Middle.fund1UNI).to.equal(investor1Before.fund1UNI.add(swapOutputAmount))

        //withdraw uni
        await fund1.connect(investor1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const investor1After = await getInvestorAccount(investor1.address)
        const manager1After = await getManagerAccount(manager1.address)

        expect(investor1After.fund1UNI).to.equal(investor1Middle.fund1UNI.sub(withdrawAmountUNI))
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.rewardTokens[0][1]).to.equal(manager1Middle.rewardTokens[0][1])
        expect(manager1After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund1After.uni).to.equal(fund1Middle.uni.sub(investorWithdrawAmount))
      })
    })

    // if error msg is 'Price slippage check',
    // check amount0 vs amount1 ratio. 
    // (2022/10/31) UNI vs ETH => 200 : 1 (OK)
    describe("investor1's liquidity token : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintNewPositionParams(
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
        await fund1.connect(manager1).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const params = increaseLiquidityParams(
          investor1.address,
          tokenIds[0],
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund1.connect(manager1).increaseLiquidity(params, { value: 0 })
      })

      it("liquidityOracle get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const tokenAmount = await liquidityOracle.connect(manager1).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const params = collectPositionFeeParams(
          investor1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund1.connect(manager1).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const params = decreaseLiquidityParams(
          investor1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })
      })

    })

    describe("invalid parameter on liquidity request", async function () {

      it("mint new position -> wrong investor", async function () {
        const params = mintNewPositionParams(
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
        await expect(fund1.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("get manager1, investor1 position's token0, token1, amount0, amount1 in fund1", async function () {
        const manager1TokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const manager1TokenAmount = await liquidityOracle.connect(manager1).getPositionTokenAmount(manager1TokenIds[0].toNumber())
        const investor1TokenIds = await fund1.connect(investor1).getPositionTokenIds(investor1.address)
        const investor1TokenAmount = await liquidityOracle.connect(investor1).getPositionTokenAmount(investor1TokenIds[0].toNumber())
        console.log('manager1 tokenId :', manager1TokenAmount)
        console.log('investor1 tokenId :', investor1TokenAmount)
      })

      it("get manager1, investor1 investor tokens in fund1", async function () {
        const manager1Tokens = await fund1.connect(manager1).getInvestorTokens(manager1.address)
        const manager1Token0 = manager1Tokens[0].tokenAddress
        const manager1Token1 = manager1Tokens[1].tokenAddress
        const manager1Amount0 = manager1Tokens[0].amount
        const manager1Amount1 = manager1Tokens[1].amount
        console.log('manager1 token0 address :', manager1Token0)
        console.log('manager1 token0 amount :', manager1Amount0)
        console.log('manager1 token1 address :', manager1Token1)
        console.log('manager1 token1 amount :', manager1Amount1)

        const investor1Tokens = await fund1.connect(investor1).getInvestorTokens(investor1.address)
        const investor1Token0 = investor1Tokens[0].tokenAddress
        const investor1Token1 = investor1Tokens[1].tokenAddress
        const investor1Amount0 = investor1Tokens[0].amount
        const investor1Amount1 = investor1Tokens[1].amount
        console.log('investor1 token0 address :', investor1Token0)
        console.log('investor1 token0 amount :', investor1Amount0)
        console.log('investor1 token1 address :', investor1Token1)
        console.log('investor1 token1 amount :', investor1Amount1)
      })

      it("mint new position -> too many token amount", async function () {
        const params = mintNewPositionParams(
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
        await expect(fund1.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("reset UNI from white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true

        await factory.connect(deployer).resetWhiteListToken(UNI)

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

      })

      it("mint new position -> not white list token", async function () {
        const params = mintNewPositionParams(
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
        await expect(fund1.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("set UNI to white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        await factory.connect(deployer).setWhiteListToken(UNI)

        isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.true
      })

      it("increase liquidity -> wrong investor", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const params = increaseLiquidityParams(
          investor1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("increase liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const params = increaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("get manager1, investor1 investor tokens in fund1", async function () {
        const investor1Tokens = await fund1.connect(investor1).getInvestorTokens(investor1.address)
        const investor1Token0 = investor1Tokens[0].tokenAddress
        const investor1Token1 = investor1Tokens[1].tokenAddress
        const investor1Amount0 = investor1Tokens[0].amount
        const investor1Amount1 = investor1Tokens[1].amount
        console.log('investor1 token0 address :', investor1Token0)
        console.log('investor1 token0 amount :', investor1Amount0)
        console.log('investor1 token1 address :', investor1Token1)
        console.log('investor1 token1 amount :', investor1Amount1)
      })

      it("increase liquidity -> too many token amount", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const params = increaseLiquidityParams(
          investor1.address,
          tokenIds[0],
          BigNumber.from(60000000),
          BigNumber.from(300000),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong investor", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const params = collectPositionFeeParams(
          investor1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund1.connect(manager1).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong tokenId", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const params = collectPositionFeeParams(
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund1.connect(manager1).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong investor", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const params = decreaseLiquidityParams(
          investor1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many liquidity", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        console.log(tokenIdInfo.liquidity)

        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          3000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many token amount", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        console.log(tokenIdInfo.liquidity)

        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await expect(fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("fee out -> not manager", async function () {
        await expect(fund1.connect(investor1).feeOut(UNI, 100000)).to.be.reverted
      })

      it("fee out -> too many token amount", async function () {
        const feeTokens = await fund1.connect(manager1).getFeeTokens()
        console.log(feeTokens)
        await expect(fund1.connect(manager1).feeOut(UNI, 2000000000)).to.be.reverted
      })
    })
  })

  describe('manager1 + manager2', () => {

    it("manager1 not subscribed to manager2 ", async function () {
      expect(await factory.connect(manager1).isSubscribed(manager1.address, fund2Address)).to.be.false
    })

    it("manager2 not subscribed to manager1", async function () {
      expect(await factory.connect(manager2).isSubscribed(manager2.address, fund1Address)).to.be.false
    })

    it("manager1 fail to deposit, withdraw and swap", async function () {
      await expect(manager1.sendTransaction({
        to: fund2Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })).to.be.reverted

      await weth9.connect(manager1).approve(fund2Address, constants.MaxUint256)
      
      //deposit, withdraw
      await expect(fund2.connect(manager1).deposit(WETH9, DEPOSIT_AMOUNT)).to.be.reverted
      await expect(fund2.connect(manager1).withdraw(WETH9, WITHDRAW_AMOUNT)).to.be.reverted
      //swap exactInput
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = BigNumber.from(10000)
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        manager1.address,
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
    })

    it("manager2 fail to deposit, withdraw and swap", async function () {
      await expect(manager2.sendTransaction({
        to: fund1Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })).to.be.reverted

      await weth9.connect(manager2).approve(fund1Address, constants.MaxUint256)
      
      //deposit, withdraw
      await expect(fund1.connect(manager2).deposit(WETH9, DEPOSIT_AMOUNT)).to.be.reverted
      await expect(fund1.connect(manager2).withdraw(WETH9, WITHDRAW_AMOUNT)).to.be.reverted
      //swap exactInput
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = BigNumber.from(10000)
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        manager2.address,
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await expect(fund1.connect(manager2).swap(params, { value: 0 })).to.be.reverted
    })

    it("manager1 subscribe to manager2", async function () {
      await factory.connect(manager1).subscribe(fund2Address)
    })

    it("manager2 subscribe to manager1", async function () {
      await factory.connect(manager2).subscribe(fund1Address)
    })

    it("check manager1, manager2 subscribed eash other", async function () {
      expect(await factory.connect(manager1).isSubscribed(manager1.address, fund2Address)).to.be.true
      expect(await factory.connect(manager2).isSubscribed(manager2.address, fund1Address)).to.be.true
    })

    it("manager1 deposit ETH to fund2", async function () {
      const fund2Before = await getFundAccount(fund2.address)
      const manager1Before = await getManagerAccount(manager1.address)

      await manager1.sendTransaction({
        to: fund2Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })

      const fund2After = await getFundAccount(fund2.address)
      const manager1After = await getManagerAccount(manager1.address)
      const manager2After = await getManagerAccount(manager2.address)

      expect(manager2After.rewardTokens).to.be.empty
      expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH.add(DEPOSIT_AMOUNT))
      expect(fund2After.weth9).to.equal(fund2Before.weth9.add(DEPOSIT_AMOUNT))
    })

    it("manager1 withdraw ETH from fund2", async function () {
      const fund2Before = await getFundAccount(fund2.address)
      const manager1Before = await getManagerAccount(manager1.address)

      await fund2.connect(manager1).withdraw(WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const fund2After = await getFundAccount(fund2.address)
      const manager1After = await getManagerAccount(manager1.address)
      const manager2After = await getManagerAccount(manager2.address)

      expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH.sub(WITHDRAW_AMOUNT))
      expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // tokenAddress
      expect(manager2After.rewardTokens[0][1]).to.equal(fee) // amount
      expect(fund2After.weth9).to.equal(fund2Before.weth9.sub(investorWithdrawAmount))
    })

    it("manager1 convert ETH -> WETH", async function () {
        const manager1Before = await getManagerAccount(manager1.address)

        await weth9.connect(manager1).deposit({
          from: manager1.address,
          value: WETH_CHARGE_AMOUNT
        })

        const manager1After = await getManagerAccount(manager1.address)
        expect(manager1After.weth9).to.equal(manager1Before.weth9.add(WETH_CHARGE_AMOUNT))
    })

    it("manager1 deposit WETH to fund2", async function () {
      const fund2Before = await getFundAccount(fund2.address)
      const manager1Before = await getManagerAccount(manager1.address)
      const manager2Before = await getManagerAccount(manager2.address)

      await weth9.connect(manager1).approve(fund2Address, constants.MaxUint256)
      await fund2.connect(manager1).deposit(WETH9, DEPOSIT_AMOUNT)

      const fund2After = await getFundAccount(fund2.address)
      const manager1After = await getManagerAccount(manager1.address)
      const manager2After = await getManagerAccount(manager2.address)

      expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH.add(DEPOSIT_AMOUNT))
      expect(manager2After.rewardTokens[0][0]).to.equal(manager2Before.rewardTokens[0][0]) // tokenAddress
      expect(manager2After.rewardTokens[0][1]).to.equal(manager2Before.rewardTokens[0][1]) // amount
      expect(fund2After.weth9).to.equal(fund2Before.weth9.add(DEPOSIT_AMOUNT))
    })

    it("manager1 withdraw ETH from fund2", async function () {
      const fund2Before = await getFundAccount(fund2.address)
      const manager1Before = await getManagerAccount(manager1.address)
      const manager2Before = await getManagerAccount(manager2.address)

      await fund2.connect(manager1).withdraw(WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const fund2After = await getFundAccount(fund2.address)
      const manager1After = await getManagerAccount(manager1.address)
      const manager2After = await getManagerAccount(manager2.address)

      expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH.sub(WITHDRAW_AMOUNT))
      expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // tokenAddress
      expect(manager2After.rewardTokens[0][1]) 
        .to.equal(BigNumber.from(manager2Before.rewardTokens[0][1]).add(fee)) // amount
      expect(fund2After.weth9).to.equal(fund2Before.weth9.sub(investorWithdrawAmount))
    })

    it("manager2 deposit ETH to fund2", async function () {
      const fund2Before = await getFundAccount(fund2.address)
      const manager1Before = await getManagerAccount(manager1.address)
      const manager2Before = await getManagerAccount(manager2.address)

      await manager2.sendTransaction({
        to: fund2Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })

      const fund2After = await getFundAccount(fund2.address)
      const manager1After = await getManagerAccount(manager1.address)
      const manager2After = await getManagerAccount(manager2.address)

      expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH)
      expect(manager2After.rewardTokens[0][0]).to.equal(manager2Before.rewardTokens[0][0]) // tokenAddress
      expect(manager2After.rewardTokens[0][1]).to.equal(manager2Before.rewardTokens[0][1]) // amount
      expect(fund2After.weth9).to.equal(fund2Before.weth9.add(DEPOSIT_AMOUNT))
    })

    it("manager2 withdraw ETH from fund2", async function () {
      const fund2Before = await getFundAccount(fund2.address)
      const manager1Before = await getManagerAccount(manager1.address)
      const manager2Before = await getManagerAccount(manager2.address)

      await fund2.connect(manager2).withdraw(WETH9, WITHDRAW_AMOUNT)

      const fund2After = await getFundAccount(fund2.address)
      const manager1After = await getManagerAccount(manager1.address)
      const manager2After = await getManagerAccount(manager2.address)

      expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH)
      expect(manager2After.fund2WETH).to.equal(manager2Before.fund2WETH.sub(WITHDRAW_AMOUNT))
      expect(fund2After.weth9).to.equal(fund2Before.weth9.sub(WITHDRAW_AMOUNT))
    })

    it("manager2 convert ETH -> WETH", async function () {
        const manager2Before = await getManagerAccount(manager2.address)

        await weth9.connect(manager2).deposit({
          from: manager2.address,
          value: WETH_CHARGE_AMOUNT
        })

        const manager2After = await getManagerAccount(manager2.address)
        expect(manager2After.weth9).to.equal(manager2Before.weth9.add(WETH_CHARGE_AMOUNT))
    })

    it("manager2 deposit WETH to fund2", async function () {
      const fund2Before = await getFundAccount(fund2.address)
      const manager1Before = await getManagerAccount(manager1.address)
      const manager2Before = await getManagerAccount(manager2.address)

      await weth9.connect(manager2).approve(fund2Address, constants.MaxUint256)
      await fund2.connect(manager2).deposit(WETH9, DEPOSIT_AMOUNT)

      const fund2After = await getFundAccount(fund2.address)
      const manager1After = await getManagerAccount(manager1.address)
      const manager2After = await getManagerAccount(manager2.address)

      expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH)
      expect(fund2After.weth9).to.equal(fund2Before.weth9.add(DEPOSIT_AMOUNT))
    })

    it("manager2 withdraw ETH from fund2", async function () {
      const fund2Before = await getFundAccount(fund2.address)
      const manager1Before = await getManagerAccount(manager1.address)
      const manager2Before = await getManagerAccount(manager2.address)

      await fund2.connect(manager2).withdraw(WETH9, WITHDRAW_AMOUNT)

      const fund2After = await getFundAccount(fund2.address)
      const manager1After = await getManagerAccount(manager1.address)
      const manager2After = await getManagerAccount(manager2.address)

      expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH)
      expect(manager2After.fund2WETH).to.equal(manager2Before.fund2WETH.sub(WITHDRAW_AMOUNT))
      expect(manager2After.rewardTokens[0][0]).to.equal(manager2Before.rewardTokens[0][0]) // tokenAddress
      expect(manager2After.rewardTokens[0][1]).to.equal(manager2Before.rewardTokens[0][1]) // amount
      expect(fund2After.weth9).to.equal(fund2Before.weth9.sub(WITHDRAW_AMOUNT))
    })

    describe("manager1 reverted to swap fund2", async function () {

      it("#exactInputSingle", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputSingleParams(
          manager1.address,
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
      })

      it("#exactOutputSingle", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)

        const params = exactOutputSingleParams(
          manager1.address,
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
      })

      it("#exactInput", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputParams(
          manager1.address,
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
      })

      it("#exactOutput", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)

        const params = exactOutputParams(
          manager1.address,
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
      })
    })

    describe("manager2 swap manager1's token WETH -> UNI, withdraw manager1's UNI", async function () {

      it("#exactInputSingle => withdraw", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const fund2Before = await getFundAccount(fund2.address)
        const manager1Before = await getManagerAccount(manager1.address)

        //swap
        const params = exactInputSingleParams(
          manager1.address,
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await fund2.connect(manager2).swap(params, { value: 0 })

        const fund2Middle = await getFundAccount(fund2.address)
        const manager1Middle = await getManagerAccount(manager1.address)
        const manager2Middle = await getManagerAccount(manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager1Middle.fund2UNI).div(2)

        expect(fund2Middle.weth9).to.equal(fund2Before.weth9.sub(swapInputAmount))
        expect(manager1Middle.fund2WETH).to.equal(manager1Before.fund2WETH.sub(swapInputAmount))

        //withdraw uni
        await fund2.connect(manager1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund2After = await getFundAccount(fund2.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager1After.fund2UNI).to.equal(manager1Middle.fund2UNI.sub(withdrawAmountUNI))
        expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager2After.rewardTokens[0][1]).to.equal(manager2Middle.rewardTokens[0][1])
        expect(manager2After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager2After.rewardTokens[1][1]).to.equal(fee)
        expect(fund2After.uni).to.equal(fund2Middle.uni.sub(investorWithdrawAmount))
      })

      it("#exactOutputSingle => withdraw", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund2Before = await getFundAccount(fund2.address)
        const manager1Before = await getManagerAccount(manager1.address)
        const manager2Before = await getManagerAccount(manager2.address)

        const params = exactOutputSingleParams(
          manager1.address,
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await fund2.connect(manager2).swap(params, { value: 0 })

        const fund2Middle = await getFundAccount(fund2.address)
        const manager1Middle = await getManagerAccount(manager1.address)
        const manager2Middle = await getManagerAccount(manager2.address)

        expect(fund2Middle.uni).to.equal(fund2Before.uni.add(swapOutputAmount))
        expect(manager1Middle.fund2UNI).to.equal(manager1Before.fund2UNI.add(swapOutputAmount))

        //withdraw uni
        await fund2.connect(manager1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund2After = await getFundAccount(fund2.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager1After.fund2UNI).to.equal(manager1Middle.fund2UNI.sub(withdrawAmountUNI))
        expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager2After.rewardTokens[0][1]).to.equal(manager2Middle.rewardTokens[0][1])
        expect(manager2After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager2After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager2Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund2After.uni).to.equal(fund2Middle.uni.sub(investorWithdrawAmount))
      })

      it("#exactInput => withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund2Before = await getFundAccount(fund2.address)
        const manager1Before = await getManagerAccount(manager1.address)

        const params = exactInputParams(
          manager1.address,
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await fund2.connect(manager2).swap(params, { value: 0 })

        const fund2Middle = await getFundAccount(fund2.address)
        const manager1Middle = await getManagerAccount(manager1.address)
        const manager2Middle = await getManagerAccount(manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager1Middle.fund2UNI).div(2)

        expect(fund2Middle.weth9).to.equal(fund2Before.weth9.sub(swapInputAmount))
        expect(manager1Middle.fund2WETH).to.equal(manager1Before.fund2WETH.sub(swapInputAmount))

        //withdraw uni
        await fund2.connect(manager1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund2After = await getFundAccount(fund2.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager1After.fund2UNI).to.equal(manager1Middle.fund2UNI.sub(withdrawAmountUNI))
        expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager2After.rewardTokens[0][1]).to.equal(manager2Middle.rewardTokens[0][1])
        expect(manager2After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager2After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager2Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund2After.uni).to.equal(fund2Middle.uni.sub(investorWithdrawAmount))
      })

      it("#exactOutput => withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund2Before = await getFundAccount(fund2.address)
        const manager1Before = await getManagerAccount(manager1.address)
        const manager2Before = await getManagerAccount(manager2.address)

        const params = exactOutputParams(
          manager1.address,
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await fund2.connect(manager2).swap(params, { value: 0 })

        const fund2Middle = await getFundAccount(fund2.address)
        const manager1Middle = await getManagerAccount(manager1.address)
        const manager2Middle = await getManagerAccount(manager2.address)

        expect(fund2Middle.uni).to.equal(fund2Before.uni.add(swapOutputAmount))
        expect(manager1Middle.fund2UNI).to.equal(manager1Before.fund2UNI.add(swapOutputAmount))

        //withdraw uni
        await fund2.connect(manager1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund2After = await getFundAccount(fund2.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager1After.fund2UNI).to.equal(manager1Middle.fund2UNI.sub(withdrawAmountUNI))
        expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager2After.rewardTokens[0][1]).to.equal(manager2Middle.rewardTokens[0][1])
        expect(manager2After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager2After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager2Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund2After.uni).to.equal(fund2Middle.uni.sub(investorWithdrawAmount))
      })
    })

    describe("manager2 swap manager2's token WETH -> UNI, withdraw manager2's UNI", async function () {

      it("#exactInputSingle => withdraw", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const fund2Before = await getFundAccount(fund2.address)
        const manager2Before = await getManagerAccount(manager2.address)

        //swap
        const params = exactInputSingleParams(
          manager2.address,
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await fund2.connect(manager2).swap(params, { value: 0 })

        const fund2Middle = await getFundAccount(fund2.address)
        const manager2Middle = await getManagerAccount(manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager2Middle.fund2UNI).div(2)

        expect(fund2Middle.weth9).to.equal(fund2Before.weth9.sub(swapInputAmount))
        expect(manager2Middle.fund2WETH).to.equal(manager2Before.fund2WETH.sub(swapInputAmount))

        //withdraw uni
        await fund2.connect(manager2).withdraw(UNI, withdrawAmountUNI)

        const fund2After = await getFundAccount(fund2.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager2After.fund2UNI).to.equal(manager2Middle.fund2UNI.sub(withdrawAmountUNI))
        expect(manager2After.rewardTokens[0][0]).to.equal(manager2Before.rewardTokens[0][0])
        expect(manager2After.rewardTokens[0][1]).to.equal(manager2Before.rewardTokens[0][1])
        expect(manager2After.rewardTokens[1][0]).to.equal(manager2Before.rewardTokens[1][0])
        expect(manager2After.rewardTokens[1][1]).to.equal(manager2Before.rewardTokens[1][1])
        expect(fund2After.uni).to.equal(fund2Middle.uni.sub(withdrawAmountUNI))
      })

      it("#exactOutputSingle => withdraw", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund2Before = await getFundAccount(fund2.address)
        const manager2Before = await getManagerAccount(manager2.address)

        const params = exactOutputSingleParams(
          manager2.address,
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await fund2.connect(manager2).swap(params, { value: 0 })

        const fund2Middle = await getFundAccount(fund2.address)
        const manager2Middle = await getManagerAccount(manager2.address)

        expect(fund2Middle.uni).to.equal(fund2Before.uni.add(swapOutputAmount))
        expect(manager2Middle.fund2UNI).to.equal(manager2Before.fund2UNI.add(swapOutputAmount))

        //withdraw uni
        await fund2.connect(manager2).withdraw(UNI, withdrawAmountUNI)

        const fund2After = await getFundAccount(fund2.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager2After.fund2UNI).to.equal(manager2Middle.fund2UNI.sub(withdrawAmountUNI))
        expect(manager2After.rewardTokens[0][0]).to.equal(manager2Before.rewardTokens[0][0])
        expect(manager2After.rewardTokens[0][1]).to.equal(manager2Before.rewardTokens[0][1])
        expect(manager2After.rewardTokens[1][0]).to.equal(manager2Before.rewardTokens[1][0])
        expect(manager2After.rewardTokens[1][1]).to.equal(manager2Before.rewardTokens[1][1])
        expect(fund2After.uni).to.equal(fund2Middle.uni.sub(withdrawAmountUNI))
      })

      it("#exactInput => withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund2Before = await getFundAccount(fund2.address)
        const manager2Before = await getManagerAccount(manager2.address)

        const params = exactInputParams(
          manager2.address,
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await fund2.connect(manager2).swap(params, { value: 0 })

        const fund2Middle = await getFundAccount(fund2.address)
        const manager2Middle = await getManagerAccount(manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager2Middle.fund2UNI).div(2)

        expect(fund2Middle.weth9).to.equal(fund2Before.weth9.sub(swapInputAmount))
        expect(manager2Middle.fund2WETH).to.equal(manager2Before.fund2WETH.sub(swapInputAmount))

        //withdraw uni
        await fund2.connect(manager2).withdraw(UNI, withdrawAmountUNI)

        const fund2After = await getFundAccount(fund2.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager2After.fund2UNI).to.equal(manager2Middle.fund2UNI.sub(withdrawAmountUNI))
        expect(manager2After.rewardTokens[0][0]).to.equal(manager2Before.rewardTokens[0][0])
        expect(manager2After.rewardTokens[0][1]).to.equal(manager2Before.rewardTokens[0][1])
        expect(manager2After.rewardTokens[1][0]).to.equal(manager2Before.rewardTokens[1][0])
        expect(manager2After.rewardTokens[1][1]).to.equal(manager2Before.rewardTokens[1][1])
        expect(fund2After.uni).to.equal(fund2Middle.uni.sub(withdrawAmountUNI))
      })

      it("#exactOutput => withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund2Before = await getFundAccount(fund2.address)
        const manager2Before = await getManagerAccount(manager2.address)

        const params = exactOutputParams(
          manager2.address,
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await fund2.connect(manager2).swap(params, { value: 0 })

        const fund2Middle = await getFundAccount(fund2.address)
        const manager2Middle = await getManagerAccount(manager2.address)

        expect(fund2Middle.uni).to.equal(fund2Before.uni.add(swapOutputAmount))
        expect(manager2Middle.fund2UNI).to.equal(manager2Before.fund2UNI.add(swapOutputAmount))

        //withdraw uni
        await fund2.connect(manager2).withdraw(UNI, withdrawAmountUNI)

        const fund2After = await getFundAccount(fund2.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager2After.fund2UNI).to.equal(manager2Middle.fund2UNI.sub(withdrawAmountUNI))
        expect(manager2After.rewardTokens[0][0]).to.equal(manager2Before.rewardTokens[0][0])
        expect(manager2After.rewardTokens[0][1]).to.equal(manager2Before.rewardTokens[0][1])
        expect(manager2After.rewardTokens[1][0]).to.equal(manager2Before.rewardTokens[1][0])
        expect(manager2After.rewardTokens[1][1]).to.equal(manager2Before.rewardTokens[1][1])
        expect(fund2After.uni).to.equal(fund2Middle.uni.sub(withdrawAmountUNI))
      })
    })

    describe("manager1's liquidity token in fund2 : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintNewPositionParams(
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
        await fund2.connect(manager2).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const params = increaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund2.connect(manager2).increaseLiquidity(params, { value: 0 })
      })

      it("liquidityOracle get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const tokenAmount = await liquidityOracle.connect(manager2).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const params = collectPositionFeeParams(
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund2.connect(manager2).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund2.connect(manager2).decreaseLiquidity(params, { value: 0 })
      })
    })


    describe("manager2's liquidity token in fund2 : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintNewPositionParams(
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
        await fund2.connect(manager2).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager2.address)
        const params = increaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund2.connect(manager2).increaseLiquidity(params, { value: 0 })
      })

      it("liquidityOracle get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager2.address)
        const tokenAmount = await liquidityOracle.connect(manager2).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager2.address)
        const params = collectPositionFeeParams(
          manager2.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund2.connect(manager2).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager2.address)
        const params = decreaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund2.connect(manager2).decreaseLiquidity(params, { value: 0 })
      })
    })

    describe("manager1's invalid liquidity request on fund2 ", async function () {

      it("mint new position -> wrong investor", async function () {
        const params = mintNewPositionParams(
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
        await expect(fund2.connect(manager2).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("get manager1, manager2 position's token0, token1, amount0, amount1 in fund2", async function () {
        const manager1TokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const manager1TokenAmount = await liquidityOracle.connect(manager2).getPositionTokenAmount(manager1TokenIds[0].toNumber())
        const manager2TokenIds = await fund2.connect(manager2).getPositionTokenIds(manager2.address)
        const manager2TokenAmount = await liquidityOracle.connect(manager2).getPositionTokenAmount(manager2TokenIds[0].toNumber())
        console.log('manager1 tokenId :', manager1TokenAmount)
        console.log('manager2 tokenId :', manager2TokenAmount)
      })

      it("get manager1, manager2 investor tokens in fund2", async function () {
        const manager1Tokens = await fund2.connect(manager2).getInvestorTokens(manager1.address)
        const manager1Token0 = manager1Tokens[0].tokenAddress
        const manager1Token1 = manager1Tokens[1].tokenAddress
        const manager1Amount0 = manager1Tokens[0].amount
        const manager1Amount1 = manager1Tokens[1].amount
        console.log('manager1 token0 address :', manager1Token0)
        console.log('manager1 token0 amount :', manager1Amount0)
        console.log('manager1 token1 address :', manager1Token1)
        console.log('manager1 token1 amount :', manager1Amount1)

        const manager2Tokens = await fund2.connect(manager2).getInvestorTokens(manager2.address)
        const manager2Token0 = manager2Tokens[0].tokenAddress
        const manager2Token1 = manager2Tokens[1].tokenAddress
        const manager2Amount0 = manager2Tokens[0].amount
        const manager2Amount1 = manager2Tokens[1].amount
        console.log('manager2 token0 address :', manager2Token0)
        console.log('manager2 token0 amount :', manager2Amount0)
        console.log('manager2 token1 address :', manager2Token1)
        console.log('manager2 token1 amount :', manager2Amount1)
      })

      it("mint new position -> too many token amount", async function () {
        const params = mintNewPositionParams(
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
        await expect(fund2.connect(manager2).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("reset UNI from white list token", async function () {
        await expect(factory.connect(deployer).resetWhiteListToken(UNI))
      })

      it("mint new position -> not white list token", async function () {
        const params = mintNewPositionParams(
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
        await expect(fund2.connect(manager2).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("set UNI to white list token", async function () {
        await expect(factory.connect(deployer).setWhiteListToken(UNI))
      })

      it("increase liquidity -> wrong investor", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const params = increaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund2.connect(manager2).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("increase liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager2.address)
        const params = increaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund2.connect(manager2).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("increase liquidity -> too many token amount", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const params = increaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          BigNumber.from(600000000),
          BigNumber.from(3000000),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund2.connect(manager2).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong investor", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const params = collectPositionFeeParams(
          manager2.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund2.connect(manager2).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong tokenId", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager2.address)
        const params = collectPositionFeeParams(
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund2.connect(manager2).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong investor", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const params = decreaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund2.connect(manager2).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager2.address)
        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund2.connect(manager2).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many liquidity", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        console.log(tokenIdInfo.liquidity)

        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          200000,
          BigNumber.from(200000),
          BigNumber.from(1000),
        )
        await expect(fund2.connect(manager2).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many token amount", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        console.log(tokenIdInfo.liquidity)

        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await expect(fund2.connect(manager2).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("fee out -> not manager", async function () {
        await expect(fund2.connect(manager1).feeOut(UNI, 100000)).to.be.reverted
      })

      it("fee out -> too many token amount", async function () {
        const feeTokens = await fund2.connect(manager2).getFeeTokens()
        console.log(feeTokens)
        await expect(fund2.connect(manager2).feeOut(UNI, 2000000000)).to.be.reverted
      })
    })

    describe("manager2 deposit to fund1", async function () {

      it("manager2 deposit ETH to fund1", async function () {
        const fund1Before = await getFundAccount(fund1.address)
        const manager1Before = await getManagerAccount(manager1.address)
        const manager2Before = await getManagerAccount(manager2.address)

        await manager2.sendTransaction({
          to: fund1Address,
          value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        })

        const fund1After = await getFundAccount(fund1.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH)
        expect(manager2After.fund1WETH).to.equal(manager2Before.fund1WETH.add(DEPOSIT_AMOUNT))
        expect(fund1After.weth9).to.equal(fund1Before.weth9.add(DEPOSIT_AMOUNT))
      })

      it("manager2 withdraw ETH from fund1", async function () {
        const fund1Before = await getFundAccount(fund1.address)
        const manager1Before = await getManagerAccount(manager1.address)
        const manager2Before = await getManagerAccount(manager2.address)

        await fund1.connect(manager2).withdraw(WETH9, WITHDRAW_AMOUNT)
        const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH)
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // tokenAddress
        expect(manager1After.rewardTokens[0][1]) 
          .to.equal(BigNumber.from(manager1Before.rewardTokens[0][1]).add(fee)) // amount
        expect(manager2After.fund1WETH).to.equal(manager2Before.fund1WETH.sub(WITHDRAW_AMOUNT))
        expect(fund1After.weth9).to.equal(fund1Before.weth9.sub(investorWithdrawAmount))
      })

      it("manager2 convert ETH -> WETH", async function () {
          const manager2Before = await getManagerAccount(manager2.address)

          await weth9.connect(manager2).deposit({
            from: manager2.address,
            value: WETH_CHARGE_AMOUNT
          })

          const manager2After = await getManagerAccount(manager2.address)
          expect(manager2After.weth9).to.equal(manager2Before.weth9.add(WETH_CHARGE_AMOUNT))
      })

      it("manager2 deposit WETH to fund1", async function () {
        const fund1Before = await getFundAccount(fund1.address)
        const manager1Before = await getManagerAccount(manager1.address)
        const manager2Before = await getManagerAccount(manager2.address)

        await weth9.connect(manager2).approve(fund1Address, constants.MaxUint256)
        await fund1.connect(manager2).deposit(WETH9, DEPOSIT_AMOUNT)

        const fund1After = await getFundAccount(fund1.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH)
        expect(manager2After.fund1WETH).to.equal(manager2Before.fund1WETH.add(DEPOSIT_AMOUNT))
        expect(fund1After.weth9).to.equal(fund1Before.weth9.add(DEPOSIT_AMOUNT))
      })

      it("manager2 withdraw ETH from fund1", async function () {
        const fund1Before = await getFundAccount(fund1.address)
        const manager1Before = await getManagerAccount(manager1.address)
        const manager2Before = await getManagerAccount(manager2.address)

        await fund1.connect(manager2).withdraw(WETH9, WITHDRAW_AMOUNT)
        const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager1After.fund1WETH).to.equal(manager1Before.fund1WETH)
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // tokenAddress
        expect(manager1After.rewardTokens[0][1]) 
          .to.equal(BigNumber.from(manager1Before.rewardTokens[0][1]).add(fee)) // amount
        expect(manager2After.fund1WETH).to.equal(manager2Before.fund1WETH.sub(WITHDRAW_AMOUNT))
        expect(fund1After.weth9).to.equal(fund1Before.weth9.sub(investorWithdrawAmount))
      })
    })

    describe("manager2 swap WETH -> UNI, withdraw UNI in fund1", async function () {

      it("#exactInputSingle + withdraw", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const fund1Before = await getFundAccount(fund1.address)
        const manager2Before = await getInvestorAccount(manager2.address)

        //swap
        const params = exactInputSingleParams(
          manager2.address,
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const manager1Middle = await getManagerAccount(manager1.address)
        const manager2Middle = await getInvestorAccount(manager2.address)
        const withdrawAmountUNI = BigNumber.from(manager2Middle.fund1UNI).div(2)

        expect(fund1Middle.weth9).to.equal(fund1Before.weth9.sub(swapInputAmount))
        expect(manager2Middle.fund1WETH).to.equal(manager2Before.fund1WETH.sub(swapInputAmount))

        //withdraw uni
        await fund1.connect(manager2).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getInvestorAccount(manager2.address)

        expect(manager2After.fund1UNI).to.equal(manager2Middle.fund1UNI.sub(withdrawAmountUNI))
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.rewardTokens[0][1]).to.equal(manager1Middle.rewardTokens[0][1])
        expect(manager1After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund1After.uni).to.equal(fund1Middle.uni.sub(investorWithdrawAmount))
      })

      it("#exactOutputSingle + withdraw", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund1Before = await getFundAccount(fund1.address)
        const manager2Before = await getInvestorAccount(manager2.address)
        const manager1Before = await getManagerAccount(manager1.address)

        const params = exactOutputSingleParams(
          manager2.address,
          WETH9, 
          UNI, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0)
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const manager2Middle = await getInvestorAccount(manager2.address)
        const manager1Middle = await getManagerAccount(manager1.address)

        expect(fund1Middle.uni).to.equal(fund1Before.uni.add(swapOutputAmount))
        expect(manager2Middle.fund1UNI).to.equal(manager2Before.fund1UNI.add(swapOutputAmount))

        //withdraw uni
        await fund1.connect(manager2).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const manager2After = await getInvestorAccount(manager2.address)
        const manager1After = await getManagerAccount(manager1.address)

        expect(manager2After.fund1UNI).to.equal(manager2Middle.fund1UNI.sub(withdrawAmountUNI))
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.rewardTokens[0][1]).to.equal(manager1Middle.rewardTokens[0][1])
        expect(manager1After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund1After.uni).to.equal(fund1Middle.uni.sub(investorWithdrawAmount))
      })

      it("#exactInput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund1Before = await getFundAccount(fund1.address)
        const manager2Before = await getInvestorAccount(manager2.address)

        const params = exactInputParams(
          manager2.address,
          tokens,
          swapInputAmount,
          amountOutMinimum
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const manager2Middle = await getInvestorAccount(manager2.address)
        const manager1Middle = await getManagerAccount(manager1.address)
        const withdrawAmountUNI = BigNumber.from(manager2Middle.fund1UNI).div(2)

        expect(fund1Middle.weth9).to.equal(fund1Before.weth9.sub(swapInputAmount))
        expect(manager2Middle.fund1WETH).to.equal(manager2Before.fund1WETH.sub(swapInputAmount))

        //withdraw uni
        await fund1.connect(manager2).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const manager2After = await getInvestorAccount(manager2.address)
        const manager1After = await getManagerAccount(manager1.address)

        expect(manager2After.fund1UNI).to.equal(manager2Middle.fund1UNI.sub(withdrawAmountUNI))
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.rewardTokens[0][1]).to.equal(manager1Middle.rewardTokens[0][1])
        expect(manager1After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund1After.uni).to.equal(fund1Middle.uni.sub(investorWithdrawAmount))
      })

      it("#exactOutput + withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)
        const withdrawAmountUNI = swapOutputAmount.div(2)

        const fund1Before = await getFundAccount(fund1.address)
        const manager2Before = await getInvestorAccount(manager2.address)
        const manager1Before = await getManagerAccount(manager1.address)

        const params = exactOutputParams(
          manager2.address,
          tokens,
          swapOutputAmount,
          amountInMaximum
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const manager2Middle = await getInvestorAccount(manager2.address)
        const manager1Middle = await getManagerAccount(manager1.address)

        expect(fund1Middle.uni).to.equal(fund1Before.uni.add(swapOutputAmount))
        expect(manager2Middle.fund1UNI).to.equal(manager2Before.fund1UNI.add(swapOutputAmount))

        //withdraw uni
        await fund1.connect(manager2).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

        const fund1After = await getFundAccount(fund1.address)
        const manager2After = await getInvestorAccount(manager2.address)
        const manager1After = await getManagerAccount(manager1.address)

        expect(manager2After.fund1UNI).to.equal(manager2Middle.fund1UNI.sub(withdrawAmountUNI))
        expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // weth9
        expect(manager1After.rewardTokens[0][1]).to.equal(manager1Middle.rewardTokens[0][1])
        expect(manager1After.rewardTokens[1][0]).to.equal(UNI) // uni
        expect(manager1After.rewardTokens[1][1])
          .to.equal(BigNumber.from(manager1Middle.rewardTokens[1][1]).add(fee)) // amount
        expect(fund1After.uni).to.equal(fund1Middle.uni.sub(investorWithdrawAmount))
      })
    })

    describe("manager2's liquidity token in fund1 : ( ETH, UNI )", async function () {

      it("get manager1, manager2 investor tokens in fund1", async function () {
        const manager1Tokens = await fund1.connect(manager1).getInvestorTokens(manager1.address)
        console.log(manager1Tokens)
        const manager1Token0 = manager1Tokens[0].tokenAddress
        const manager1Token1 = manager1Tokens[1].tokenAddress
        const manager1Amount0 = manager1Tokens[0].amount
        const manager1Amount1 = manager1Tokens[1].amount
        console.log('manager1 token0 address :', manager1Token0)
        console.log('manager1 token0 amount :', manager1Amount0)
        console.log('manager1 token1 address :', manager1Token1)
        console.log('manager1 token1 amount :', manager1Amount1)

        const manager2Tokens = await fund1.connect(manager1).getInvestorTokens(manager2.address)
        console.log(manager2Tokens)

        const manager2Token0 = manager2Tokens[0].tokenAddress
        const manager2Token1 = manager2Tokens[1].tokenAddress
        const manager2Amount0 = manager2Tokens[0].amount
        const manager2Amount1 = manager2Tokens[1].amount
        console.log('manager2 token0 address :', manager2Token0)
        console.log('manager2 token0 amount :', manager2Amount0)
        console.log('manager2 token1 address :', manager2Token1)
        console.log('manager2 token1 amount :', manager2Amount1)
      })

      it("mint new position", async function () {
        const params = mintNewPositionParams(
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
        await fund1.connect(manager1).mintNewPosition(params, { value: 0 })
      })

      it("increase liquidity", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const params = increaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          BigNumber.from(200000),
          BigNumber.from(1000),
          BigNumber.from(20000),
          BigNumber.from(100),
        )
        await fund1.connect(manager1).increaseLiquidity(params, { value: 0 })
      })

      it("liquidityOracle get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const tokenAmount = await liquidityOracle.connect(manager2).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("collect position fee", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const params = collectPositionFeeParams(
          manager2.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund1.connect(manager1).collectPositionFee(params, { value: 0 })
      })

      it("decrease liquidity", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const params = decreaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })
      })

      it("get manager1, manager2 position's token0, token1, amount0, amount1 in fund1", async function () {
        const manager1TokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const manager1TokenAmount = await liquidityOracle.connect(manager1).getPositionTokenAmount(manager1TokenIds[0].toNumber())
        const manager2TokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const manager2TokenAmount = await liquidityOracle.connect(manager1).getPositionTokenAmount(manager2TokenIds[0].toNumber())
        console.log('manager1 tokenId :', manager1TokenAmount)
        console.log('manager2 tokenId :', manager2TokenAmount)
      })
    })

    describe("invalid parameter on liquidity request", async function () {

      it("mint new position -> wrong investor", async function () {
        const params = mintNewPositionParams(
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
        await expect(fund1.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("mint new position -> too many token amount", async function () {
        const params = mintNewPositionParams(
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
        await expect(fund1.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("reset UNI from white list token", async function () {
        await expect(factory.connect(deployer).resetWhiteListToken(UNI))
      })

      it("mint new position -> not white list token", async function () {
        const params = mintNewPositionParams(
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
        await expect(fund1.connect(manager1).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("set UNI to white list token", async function () {
        await expect(factory.connect(deployer).setWhiteListToken(UNI))
      })

      it("increase liquidity -> wrong investor", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const params = increaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("increase liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const params = increaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("get manager1, manager2 position's token0, token1, amount0, amount1 in fund1", async function () {
        const manager1TokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const manager1TokenAmount = await liquidityOracle.connect(manager1).getPositionTokenAmount(manager1TokenIds[0].toNumber())
        const manager2TokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const manager2TokenAmount = await liquidityOracle.connect(manager1).getPositionTokenAmount(manager2TokenIds[0].toNumber())
        console.log('manager1 tokenId :', manager1TokenAmount)
        console.log('manager2 tokenId :', manager2TokenAmount)
      })

      it("increase liquidity -> too many token amount", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        console.log(tokenIdInfo.liquidity)

        const params = increaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          BigNumber.from(300000),
          BigNumber.from(60000000),
          BigNumber.from(1000),
          BigNumber.from(200000),
        )
        await expect(fund1.connect(manager1).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong investor", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const params = collectPositionFeeParams(
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund1.connect(manager1).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("collect position fee -> wrong tokenId", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const params = collectPositionFeeParams(
          manager2.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await expect(fund1.connect(manager1).collectPositionFee(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong investor", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> wrong tokenId", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const params = decreaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many liquidity", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        console.log(tokenIdInfo.liquidity)

        const params = decreaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          20000000,
          BigNumber.from(200000),
          BigNumber.from(1000),
        )
        await expect(fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("decrease liquidity -> too many token amount", async function () {
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager2.address)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        console.log(tokenIdInfo.liquidity)

        const params = decreaseLiquidityParams(
          manager2.address,
          tokenIds[0],
          1000,
          BigNumber.from(200000),
          BigNumber.from(1000),
        )
        await expect(fund1.connect(manager1).decreaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("fee out -> not manager", async function () {
        await expect(fund1.connect(manager2).feeOut(UNI, 100000)).to.be.reverted
      })

      it("fee out -> too many token amount", async function () {
        const feeTokens = await fund1.connect(manager1).getFeeTokens()
        console.log(feeTokens)
        await expect(fund1.connect(manager1).feeOut(UNI, 2000000000)).to.be.reverted
      })
    })

    describe("white list token test", async function () {

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

        const fund2Before = await getFundAccount(fund2.address)
        const manager2Before = await getManagerAccount(manager2.address)

        await uni.connect(manager2).approve(fund2Address, constants.MaxUint256)
        await expect(fund2.connect(manager2).deposit(UNI, 100000)).to.be.reverted
      })

      it("success withdraw when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const fund2Before = await getFundAccount(fund2.address)
        const manager1Before = await getManagerAccount(manager1.address)
        const manager2Before = await getManagerAccount(manager2.address)

        const withdraw_amount = ethers.utils.parseEther("0.000000000000001")
        await fund2.connect(manager1).withdraw(UNI, withdraw_amount)
        const fee = withdraw_amount.mul(MANAGER_FEE).div(10000).div(100)
        const investorWithdrawAmount = withdraw_amount.sub(fee)

        const fund2After = await getFundAccount(fund2.address)
        const manager1After = await getManagerAccount(manager1.address)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager1After.fund2UNI).to.equal(manager1Before.fund2UNI.sub(withdraw_amount))
        expect(manager2After.rewardTokens[1][0]).to.equal(UNI) // tokenAddress
        expect(manager2After.rewardTokens[1][1]).to.equal(manager2Before.rewardTokens[1][1].add(fee)) // amount
        expect(fund2After.uni).to.equal(fund2Before.uni.sub(investorWithdrawAmount))
      })

      it("success fee out when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const manager2Before = await getManagerAccount(manager2.address)
        const feeTokens = await fund2.connect(manager2).getFeeTokens()
        console.log(feeTokens)
        await fund2.connect(manager2).feeOut(UNI, 100000)
        const manager2After = await getManagerAccount(manager2.address)

        expect(manager2After.uni).to.equal(manager2Before.uni.add(100000))
      })

      it("success swap in when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund2Before = await getFundAccount(fund2.address)
        const manager1Before = await getInvestorAccount(manager1.address)

        //swap
        const params = exactInputSingleParams(
          manager1.address,
          UNI,
          WETH9, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await fund2.connect(manager2).swap(params, { value: 0 })

        const fund2After = await getFundAccount(fund2.address)
        const manager1After = await getManagerAccount(manager1.address)

        expect(fund2After.uni).to.equal(fund2Before.uni.sub(swapInputAmount))
        expect(manager1After.fund2UNI).to.equal(manager1Before.fund2UNI.sub(swapInputAmount))
      })

      it("fail swap out when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund2Before = await getFundAccount(fund2.address)
        const manager1Before = await getInvestorAccount(manager1.address)

        //swap
        const params = exactInputSingleParams(
          manager1.address,
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0)
        )
        await expect(fund2.connect(manager2).swap(params, { value: 0 })).to.be.reverted
      })

      it("fail mint position when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const params = mintNewPositionParams(
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
        await expect(fund2.connect(manager2).mintNewPosition(params, { value: 0 })).to.be.reverted
      })

      it("fail increase liquidity when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
        const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
        console.log(tokenIdInfo)
        const params = increaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await expect(fund2.connect(manager2).increaseLiquidity(params, { value: 0 })).to.be.reverted
      })

      it("success collect fee from liquidity when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const params = collectPositionFeeParams(
          manager1.address,
          tokenIds[0],
          MaxUint128,
          MaxUint128
        )
        await fund2.connect(manager2).collectPositionFee(params, { value: 0 })
      })

      it("success decrease liquidity when not white list token", async function () {
        let isUNIWhiteListToken = await factory.connect(manager1).whiteListTokens(UNI)
        expect(isUNIWhiteListToken).to.be.false

        const tokenIds = await fund2.connect(manager2).getPositionTokenIds(manager1.address)
        const params = decreaseLiquidityParams(
          manager1.address,
          tokenIds[0],
          1000,
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund2.connect(manager2).decreaseLiquidity(params, { value: 0 })
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
        const mana = '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942'


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
        let isManaWLT = await factory.connect(manager1).whiteListTokens(mana)
        expect(isManaWLT).to.be.false


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
        console.log('MANA')
        await expect(factory.connect(deployer).setWhiteListToken(mana)).to.be.reverted
      })
    })
  })
})