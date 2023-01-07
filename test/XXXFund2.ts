import { Wallet, constants, BigNumber, ContractTransaction, Contract } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { LiquidityOracle } from '../typechain-types/contracts/LiquidityOracle'
import { XXXFactory } from '../typechain-types/contracts/XXXFactory'
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2'
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
  USDC,
  UNI,
  DAI,
  XXX,
  NULL_ADDRESS,
  V3_SWAP_ROUTER_ADDRESS,
  NonfungiblePositionManager,
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


describe('XXXFund2', () => {

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

  before("Deploy XXXFactory Contract", async function () {
    const XXXFactory = await ethers.getContractFactory("XXXFactory")
    const Factory = await XXXFactory.connect(deployer).deploy(WETH9, UNI, DAI) //XXX is error so use DAI for just test
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

  describe('user : manager1', () => {

    it("check correct factory", async function () {
      fund1 = await ethers.getContractAt("XXXFund2", fund1Address)
      expect(await fund1.connect(manager1).factory()).to.equal(factoryContractAddress)
    })

    it("check correct manager", async function () {
      expect(await fund1.connect(manager1).manager()).to.equal(manager1.address)
    })

    it("ETH -> WETH", async function () {
      const manager1Before = await getManagerAccount(manager1.address)
      await weth9.connect(manager1).deposit({
        from: manager1.address,
        value: WETH_CHARGE_AMOUNT
      })
      const manager1After = await getManagerAccount(manager1.address)
      expect(manager1After.weth9).to.equal(manager1Before.weth9.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH => receive()", async function () {
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
            BigNumber.from(0),
            fund1Address
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
            BigNumber.from(0),
            fund1Address
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
            BigNumber.from(0),
            fund1Address
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
            BigNumber.from(0),
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
            amountOutMinimum,
            fund1Address
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
            amountOutMinimum,
            fund1Address
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
            amountInMaximum,
            fund1Address
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
    describe("(fund1) Provide liquidity manager1's token : ( ETH, UNI )", async function () {

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

      it("liquidityOracle get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(manager1.address)
        const tokenAmount = await liquidityOracle.connect(manager1).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("(fund1) getInvestorTokens ", async function () {
        const tokenIds = await fund1.connect(manager1).getInvestorTokens(manager1.address)
        const token0 = tokenIds[0].tokenAddress
        const token1 = tokenIds[1].tokenAddress
        const amount0 = tokenIds[0].amount
        const amount1 = tokenIds[1].amount
        console.log(tokenIds[0].tokenAddress)
        console.log(tokenIds[0].amount)
        console.log(tokenIds[1].tokenAddress)
        console.log(tokenIds[1].amount)
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

  describe('user : manager1, investor1', () => {

    it("investor1 not register yet => manager1", async function () {
      expect(await factory.connect(investor1).isSubscribed(investor1.address, fund1Address)).to.be.false
    })

    it("investor1 not register yet => deposit, withdraw swap fail", async function () {
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
        amountOutMinimum,
        fund1Address
      )
      await expect(fund1.connect(investor1).swap(params, { value: 0 })).to.be.reverted
    })

    it("investor1 register => manager1", async function () {
      await factory.connect(investor1).subscribe(fund1Address)
    })

    it("check investor1 registered", async function () {
      const isRegistered = await factory.connect(investor1).isSubscribed(investor1.address, fund1Address)
      expect(isRegistered).to.be.true
    })

    it("ETH -> WETH", async function () {
        const investor1Before = await getInvestorAccount(investor1.address)

        await weth9.connect(investor1).deposit({
          from: investor1.address,
          value: WETH_CHARGE_AMOUNT
        })

        const investor1After = await getInvestorAccount(investor1.address)
        expect(investor1After.weth9).to.equal(investor1Before.weth9.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH => receive() ( MANAGER_FEE 1% )", async function () {
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

    it("withdraw ETH ( MANAGER_FEE 1% )", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      const investor1Before = await getInvestorAccount(investor1.address)

      await fund1.connect(investor1).withdraw(WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const fund1After = await getFundAccount(fund1.address)
      const investor1After = await getInvestorAccount(investor1.address)
      const manager1After = await getManagerAccount(manager1.address)

      expect(investor1After.fund1WETH).to.equal(investor1Before.fund1WETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.rewardTokens[0][0]).to.equal(WETH9) // tokenAddress
      expect(manager1After.rewardTokens[0][1]).to.equal(fee) // amount
      expect(fund1After.weth9).to.equal(fund1Before.weth9.sub(investorWithdrawAmount))
    })

    it("deposit WETH ( MANAGER_FEE 1% )", async function () {
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

    it("withdraw WETH ( MANAGER_FEE 1% )", async function () {
      const fund1Before = await getFundAccount(fund1.address)
      const investor1Before = await getInvestorAccount(investor1.address)
      const manager1Before = await getManagerAccount(manager1.address)

      await fund1.connect(investor1).withdraw(WETH9, WITHDRAW_AMOUNT)
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
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

    describe("investor1 swap => reverted", async function () {

      it("#exactInputSingle", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputSingleParams(
          investor1.address,
          WETH9,
          UNI, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0),
          fund1Address
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
          BigNumber.from(0),
          fund1Address
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
          amountOutMinimum,
          fund1Address
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
          amountInMaximum,
          fund1Address
        )
        await expect(fund1.connect(investor1).swap(params, { value: 0 })).to.be.reverted
      })

    })

    describe("(fund1) swap investor1's token WETH -> UNI, withdraw investor1's UNI", async function () {

      it("#exactInputSingle => withdraw", async function () {
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
          BigNumber.from(0),
          fund1Address
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
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(100)
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

      it("#exactOutputSingle => withdraw", async function () {
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
          BigNumber.from(0),
          fund1Address
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const investor1Middle = await getInvestorAccount(investor1.address)
        const manager1Middle = await getManagerAccount(manager1.address)

        expect(fund1Middle.uni).to.equal(fund1Before.uni.add(swapOutputAmount))
        expect(investor1Middle.fund1UNI).to.equal(investor1Before.fund1UNI.add(swapOutputAmount))

        //withdraw uni
        await fund1.connect(investor1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(100)
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

      it("#exactInput => withdraw", async function () {
        const tokens = [WETH9, DAI, UNI]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const fund1Before = await getFundAccount(fund1.address)
        const investor1Before = await getInvestorAccount(investor1.address)

        const params = exactInputParams(
          investor1.address,
          tokens,
          swapInputAmount,
          amountOutMinimum,
          fund1Address
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
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(100)
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

      it("#exactOutput => withdraw", async function () {
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
          amountInMaximum,
          fund1Address
        )
        await fund1.connect(manager1).swap(params, { value: 0 })

        const fund1Middle = await getFundAccount(fund1.address)
        const investor1Middle = await getInvestorAccount(investor1.address)
        const manager1Middle = await getManagerAccount(manager1.address)

        expect(fund1Middle.uni).to.equal(fund1Before.uni.add(swapOutputAmount))
        expect(investor1Middle.fund1UNI).to.equal(investor1Before.fund1UNI.add(swapOutputAmount))

        //withdraw uni
        await fund1.connect(investor1).withdraw(UNI, withdrawAmountUNI)
        const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(100)
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
    describe("(fund1) Provide liquidity investor1's token : ( ETH, UNI )", async function () {

      it("mint new position", async function () {
        const params = mintNewPositionParams(
          investor1.address,
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
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const params = increaseLiquidityParams(
          investor1.address,
          tokenIds[0],
          BigNumber.from(20000),
          BigNumber.from(100),
          BigNumber.from(2000),
          BigNumber.from(10),
        )
        await fund1.connect(manager1).increaseLiquidity(params, { value: 0 })
      })

      it("liquidityOracle get token0, token1, amount0, amount1", async function () {
        const tokenIds = await fund1.connect(manager1).getPositionTokenIds(investor1.address)
        const tokenAmount = await liquidityOracle.connect(manager1).getPositionTokenAmount(tokenIds[0].toNumber())
      })

      it("(fund1) getInvestorTokens ", async function () {
        const tokenIds = await fund1.connect(manager1).getInvestorTokens(investor1.address)
        const token0 = tokenIds[0].tokenAddress
        const token1 = tokenIds[1].tokenAddress
        const amount0 = tokenIds[0].amount
        const amount1 = tokenIds[1].amount
        console.log(tokenIds[0].tokenAddress)
        console.log(tokenIds[0].amount)
        console.log(tokenIds[1].tokenAddress)
        console.log(tokenIds[1].amount)
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

    // describe("(fund1) Provide liquidity investor1's token : ( ETH, UNI )", async function () {

    //   it("mint new position", async function () {

    //   })

    //   it("increase liquidity", async function () {

    //   })

    //   it("collect all fees", async function () {

    //   })

    //   it("decrease liquidity", async function () {

    //   })

    // })

    // describe("(fund1) Provide liquidity manager1's token : ( UNI, USDC )", async function () {
      
    //   it("mint new position", async function () {

    //   })

    //   it("increase liquidity", async function () {

    //   })

    //   it("collect all fees", async function () {

    //   })

    //   it("decrease liquidity", async function () {

    //   })
      
    // })

  })

  // describe('user : manager1, manager2 (investor : manager1, manager : manager2)', () => {

  //   it("manager1 not register yet => manager2 ", async function () {
  //     expect(await factory.connect(manager1).isSubscribed(manager1.address, fund2Address)).to.be.false
  //   })

  //   it("manager2 not register yet => manager1", async function () {
  //     expect(await factory.connect(manager2).isSubscribed(manager2.address, fund1Address)).to.be.false
  //   })

  //   it("when manager1 not register to manager2, deposit, withdraw swap fail", async function () {
  //     await expect(manager1.sendTransaction({
  //       to: fund2Address,
  //       value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
  //     })).to.be.reverted

  //     await weth9.connect(manager1).approve(fund2Address, constants.MaxUint256)
      
  //     //deposit, withdraw
  //     await expect(fund2.connect(manager1).deposit(WETH9, DEPOSIT_AMOUNT)).to.be.reverted
  //     await expect(fund2.connect(manager1).withdraw(WETH9, WITHDRAW_AMOUNT)).to.be.reverted
  //     //swap exactInput
  //     const tokens = [WETH9, DAI, UNI]
  //     const swapInputAmount = BigNumber.from(10000)
  //     const amountOutMinimum = BigNumber.from(1)
  //     const params = exactInputParams(
  //       manager1.address,
  //       tokens,
  //       swapInputAmount,
  //       amountOutMinimum,
  //       fund2Address
  //     )
  //     await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
  //   })

  //   it("when manager2 not register to manager1, deposit, withdraw swap fail", async function () {
  //     await expect(manager2.sendTransaction({
  //       to: fund1Address,
  //       value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
  //     })).to.be.reverted

  //     await weth9.connect(manager2).approve(fund1Address, constants.MaxUint256)
      
  //     //deposit, withdraw
  //     await expect(fund1.connect(manager2).deposit(WETH9, DEPOSIT_AMOUNT)).to.be.reverted
  //     await expect(fund1.connect(manager2).withdraw(WETH9, WITHDRAW_AMOUNT)).to.be.reverted
  //     //swap exactInput
  //     const tokens = [WETH9, DAI, UNI]
  //     const swapInputAmount = BigNumber.from(10000)
  //     const amountOutMinimum = BigNumber.from(1)
  //     const params = exactInputParams(
  //       manager2.address,
  //       tokens,
  //       swapInputAmount,
  //       amountOutMinimum,
  //       fund1Address
  //     )
  //     await expect(fund1.connect(manager2).swap(params, { value: 0 })).to.be.reverted
  //   })

  //   it("manager1 register to manager2", async function () {
  //     await factory.connect(manager1).subscribe(fund2Address)
  //   })

  //   it("manager2 register to manager1", async function () {
  //     await factory.connect(manager2).subscribe(fund1Address)
  //   })

  //   it("now check manager1, manager2 registered eash other", async function () {
  //     expect(await factory.connect(manager1).isSubscribed(manager1.address, fund2Address)).to.be.true
  //     expect(await factory.connect(manager2).isSubscribed(manager2.address, fund1Address)).to.be.true
  //   })

  //   it("ETH -> WETH", async function () {
  //       const manager1Before = await getManagerAccount(manager1.address)

  //       await weth9.connect(manager1).deposit({
  //         from: manager1.address,
  //         value: WETH_CHARGE_AMOUNT
  //       })

  //       const manager1After = await getManagerAccount(manager1.address)
  //       expect(manager1After.weth9).to.equal(manager1Before.weth9.add(WETH_CHARGE_AMOUNT))
  //   })

  //   it("deposit ETH => receive() ( MANAGER_FEE 1% )", async function () {
  //     const fund2Before = await getFundAccount(fund2.address)
  //     const manager1Before = await getManagerAccount(manager1.address)

  //     await manager1.sendTransaction({
  //       to: fund2Address,
  //       value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
  //     })

  //     const fund2After = await getFundAccount(fund2.address)
  //     const manager1After = await getManagerAccount(manager1.address)
  //     const manager2After = await getManagerAccount(manager2.address)

  //     expect(manager2After.rewardTokens).to.be.empty
  //     expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH.add(DEPOSIT_AMOUNT))
  //     expect(fund2After.weth9).to.equal(fund2Before.weth9.add(DEPOSIT_AMOUNT))
  //   })

  //   it("withdraw ETH ( MANAGER_FEE 1% )", async function () {
  //     const fund2Before = await getFundAccount(fund2.address)
  //     const manager1Before = await getManagerAccount(manager1.address)

  //     await fund2.connect(manager1).withdraw(WETH9, WITHDRAW_AMOUNT)
  //     const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
  //     const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

  //     const fund2After = await getFundAccount(fund2.address)
  //     const manager1After = await getManagerAccount(manager1.address)
  //     const manager2After = await getManagerAccount(manager2.address)

  //     expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH.sub(WITHDRAW_AMOUNT))
  //     expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // tokenAddress
  //     expect(manager2After.rewardTokens[0][1]).to.equal(fee) // amount
  //     expect(fund2After.weth9).to.equal(fund2Before.weth9.sub(investorWithdrawAmount))
  //   })

  //   it("deposit WETH ( MANAGER_FEE 1% )", async function () {
  //     const fund2Before = await getFundAccount(fund2.address)
  //     const manager1Before = await getManagerAccount(manager1.address)
  //     const manager2Before = await getManagerAccount(manager2.address)

  //     await weth9.connect(manager1).approve(fund2Address, constants.MaxUint256)
  //     await fund2.connect(manager1).deposit(WETH9, DEPOSIT_AMOUNT)

  //     const fund2After = await getFundAccount(fund2.address)
  //     const manager1After = await getManagerAccount(manager1.address)
  //     const manager2After = await getManagerAccount(manager2.address)

  //     expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH.add(DEPOSIT_AMOUNT))
  //     expect(manager2After.rewardTokens[0][0]).to.equal(manager2Before.rewardTokens[0][0]) // tokenAddress
  //     expect(manager2After.rewardTokens[0][1]).to.equal(manager2Before.rewardTokens[0][1]) // amount
  //     expect(fund2After.weth9).to.equal(fund2Before.weth9.add(DEPOSIT_AMOUNT))
  //   })

  //   it("withdraw WETH ( MANAGER_FEE 1% )", async function () {
  //     const fund2Before = await getFundAccount(fund2.address)
  //     const manager1Before = await getManagerAccount(manager1.address)
  //     const manager2Before = await getManagerAccount(manager2.address)

  //     await fund2.connect(manager1).withdraw(WETH9, WITHDRAW_AMOUNT)
  //     const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
  //     const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

  //     const fund2After = await getFundAccount(fund2.address)
  //     const manager1After = await getManagerAccount(manager1.address)
  //     const manager2After = await getManagerAccount(manager2.address)

  //     expect(manager1After.fund2WETH).to.equal(manager1Before.fund2WETH.sub(WITHDRAW_AMOUNT))
  //     expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // tokenAddress
  //     expect(manager2After.rewardTokens[0][1]) 
  //       .to.equal(BigNumber.from(manager2Before.rewardTokens[0][1]).add(fee)) // amount
  //     expect(fund2After.weth9).to.equal(fund2Before.weth9.sub(investorWithdrawAmount))
  //   })

  //   describe("manager1 swap => reverted", async function () {

  //     it("#exactInputSingle", async function () {
  //       const swapInputAmount = BigNumber.from(1000000)
  //       const amountOutMinimum = BigNumber.from(1)

  //       const params = exactInputSingleParams(
  //         manager1.address,
  //         WETH9,
  //         UNI, 
  //         swapInputAmount, 
  //         amountOutMinimum, 
  //         BigNumber.from(0),
  //         fund2Address
  //       )
  //       await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
  //     })

  //     it("#exactOutputSingle", async function () {
  //       const swapOutputAmount = BigNumber.from(1000000)
  //       const amountInMaximum = BigNumber.from(100000)

  //       const params = exactOutputSingleParams(
  //         manager1.address,
  //         WETH9, 
  //         UNI, 
  //         swapOutputAmount, 
  //         amountInMaximum, 
  //         BigNumber.from(0),
  //         fund2Address
  //       )
  //       await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
  //     })

  //     it("#exactInput", async function () {
  //       const tokens = [WETH9, DAI, UNI]
  //       const swapInputAmount = BigNumber.from(10000)
  //       const amountOutMinimum = BigNumber.from(1)

  //       const params = exactInputParams(
  //         manager1.address,
  //         tokens,
  //         swapInputAmount,
  //         amountOutMinimum,
  //         fund2Address
  //       )
  //       await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
  //     })

  //     it("#exactOutput", async function () {
  //       const tokens = [WETH9, DAI, UNI]
  //       const swapOutputAmount = BigNumber.from(1000000)
  //       const amountInMaximum = BigNumber.from(100000)

  //       const params = exactOutputParams(
  //         manager1.address,
  //         tokens,
  //         swapOutputAmount,
  //         amountInMaximum,
  //         fund2Address
  //       )
  //       await expect(fund2.connect(manager1).swap(params, { value: 0 })).to.be.reverted
  //     })

  //   })

  //   describe("(fund2) swap manager1's token WETH -> UNI, withdraw manager1's UNI", async function () {

  //     it("#exactInputSingle => withdraw", async function () {
  //       const swapInputAmount = BigNumber.from(1000000)
  //       const amountOutMinimum = BigNumber.from(1)

  //       const fund2Before = await getFundAccount(fund2.address)
  //       const manager1Before = await getManagerAccount(manager1.address)

  //       //swap
  //       const params = exactInputSingleParams(
  //         manager1.address,
  //         WETH9,
  //         UNI, 
  //         swapInputAmount, 
  //         amountOutMinimum, 
  //         BigNumber.from(0),
  //         fund2Address
  //       )
  //       await fund2.connect(manager2).swap(params, { value: 0 })

  //       const fund2Middle = await getFundAccount(fund2.address)
  //       const manager1Middle = await getManagerAccount(manager1.address)
  //       const manager2Middle = await getManagerAccount(manager2.address)
  //       const withdrawAmountUNI = BigNumber.from(manager1Middle.fund2UNI).div(2)

  //       expect(fund2Middle.weth9).to.equal(fund2Before.weth9.sub(swapInputAmount))
  //       expect(manager1Middle.fund2WETH).to.equal(manager1Before.fund2WETH.sub(swapInputAmount))

  //       //withdraw uni
  //       await fund2.connect(manager1).withdraw(UNI, withdrawAmountUNI)
  //       const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(100)
  //       const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

  //       const fund2After = await getFundAccount(fund2.address)
  //       const manager1After = await getManagerAccount(manager1.address)
  //       const manager2After = await getManagerAccount(manager2.address)

  //       expect(manager1After.fund2UNI).to.equal(manager1Middle.fund2UNI.sub(withdrawAmountUNI))
  //       expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // weth9
  //       expect(manager2After.rewardTokens[0][1]).to.equal(manager2Middle.rewardTokens[0][1])
  //       expect(manager2After.rewardTokens[1][0]).to.equal(UNI) // uni
  //       expect(manager2After.rewardTokens[1][1]).to.equal(fee)
  //       expect(fund2After.uni).to.equal(fund2Middle.uni.sub(investorWithdrawAmount))
  //     })

  //     it("#exactOutputSingle => withdraw", async function () {
  //       const swapOutputAmount = BigNumber.from(1000000)
  //       const amountInMaximum = BigNumber.from(100000)
  //       const withdrawAmountUNI = swapOutputAmount.div(2)

  //       const fund2Before = await getFundAccount(fund2.address)
  //       const manager1Before = await getManagerAccount(manager1.address)
  //       const manager2Before = await getManagerAccount(manager2.address)

  //       const params = exactOutputSingleParams(
  //         manager1.address,
  //         WETH9, 
  //         UNI, 
  //         swapOutputAmount, 
  //         amountInMaximum, 
  //         BigNumber.from(0),
  //         fund2Address
  //       )
  //       await fund2.connect(manager2).swap(params, { value: 0 })

  //       const fund2Middle = await getFundAccount(fund2.address)
  //       const manager1Middle = await getManagerAccount(manager1.address)
  //       const manager2Middle = await getManagerAccount(manager2.address)

  //       expect(fund2Middle.uni).to.equal(fund2Before.uni.add(swapOutputAmount))
  //       expect(manager1Middle.fund2UNI).to.equal(manager1Before.fund2UNI.add(swapOutputAmount))

  //       //withdraw uni
  //       await fund2.connect(manager1).withdraw(UNI, withdrawAmountUNI)
  //       const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(100)
  //       const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

  //       const fund2After = await getFundAccount(fund2.address)
  //       const manager1After = await getManagerAccount(manager1.address)
  //       const manager2After = await getManagerAccount(manager2.address)

  //       expect(manager1After.fund2UNI).to.equal(manager1Middle.fund2UNI.sub(withdrawAmountUNI))
  //       expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // weth9
  //       expect(manager2After.rewardTokens[0][1]).to.equal(manager2Middle.rewardTokens[0][1])
  //       expect(manager2After.rewardTokens[1][0]).to.equal(UNI) // uni
  //       expect(manager2After.rewardTokens[1][1])
  //         .to.equal(BigNumber.from(manager2Middle.rewardTokens[1][1]).add(fee)) // amount
  //       expect(fund2After.uni).to.equal(fund2Middle.uni.sub(investorWithdrawAmount))
  //     })

  //     it("#exactInput => withdraw", async function () {
  //       const tokens = [WETH9, DAI, UNI]
  //       const swapInputAmount = BigNumber.from(10000)
  //       const amountOutMinimum = BigNumber.from(1)

  //       const fund2Before = await getFundAccount(fund2.address)
  //       const manager1Before = await getManagerAccount(manager1.address)

  //       const params = exactInputParams(
  //         manager1.address,
  //         tokens,
  //         swapInputAmount,
  //         amountOutMinimum,
  //         fund2Address
  //       )
  //       await fund2.connect(manager2).swap(params, { value: 0 })

  //       const fund2Middle = await getFundAccount(fund2.address)
  //       const manager1Middle = await getManagerAccount(manager1.address)
  //       const manager2Middle = await getManagerAccount(manager2.address)
  //       const withdrawAmountUNI = BigNumber.from(manager1Middle.fund2UNI).div(2)

  //       expect(fund2Middle.weth9).to.equal(fund2Before.weth9.sub(swapInputAmount))
  //       expect(manager1Middle.fund2WETH).to.equal(manager1Before.fund2WETH.sub(swapInputAmount))

  //       //withdraw uni
  //       await fund2.connect(manager1).withdraw(UNI, withdrawAmountUNI)
  //       const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(100)
  //       const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

  //       const fund2After = await getFundAccount(fund2.address)
  //       const manager1After = await getManagerAccount(manager1.address)
  //       const manager2After = await getManagerAccount(manager2.address)

  //       expect(manager1After.fund2UNI).to.equal(manager1Middle.fund2UNI.sub(withdrawAmountUNI))
  //       expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // weth9
  //       expect(manager2After.rewardTokens[0][1]).to.equal(manager2Middle.rewardTokens[0][1])
  //       expect(manager2After.rewardTokens[1][0]).to.equal(UNI) // uni
  //       expect(manager2After.rewardTokens[1][1])
  //         .to.equal(BigNumber.from(manager2Middle.rewardTokens[1][1]).add(fee)) // amount
  //       expect(fund2After.uni).to.equal(fund2Middle.uni.sub(investorWithdrawAmount))
  //     })

  //     it("#exactOutput => withdraw", async function () {
  //       const tokens = [WETH9, DAI, UNI]
  //       const swapOutputAmount = BigNumber.from(1000000)
  //       const amountInMaximum = BigNumber.from(100000)
  //       const withdrawAmountUNI = swapOutputAmount.div(2)

  //       const fund2Before = await getFundAccount(fund2.address)
  //       const manager1Before = await getManagerAccount(manager1.address)
  //       const manager2Before = await getManagerAccount(manager2.address)

  //       const params = exactOutputParams(
  //         manager1.address,
  //         tokens,
  //         swapOutputAmount,
  //         amountInMaximum,
  //         fund2Address
  //       )
  //       await fund2.connect(manager2).swap(params, { value: 0 })

  //       const fund2Middle = await getFundAccount(fund2.address)
  //       const manager1Middle = await getManagerAccount(manager1.address)
  //       const manager2Middle = await getManagerAccount(manager2.address)

  //       expect(fund2Middle.uni).to.equal(fund2Before.uni.add(swapOutputAmount))
  //       expect(manager1Middle.fund2UNI).to.equal(manager1Before.fund2UNI.add(swapOutputAmount))

  //       //withdraw uni
  //       await fund2.connect(manager1).withdraw(UNI, withdrawAmountUNI)
  //       const fee = withdrawAmountUNI.mul(MANAGER_FEE).div(100)
  //       const investorWithdrawAmount = withdrawAmountUNI.sub(fee)

  //       const fund2After = await getFundAccount(fund2.address)
  //       const manager1After = await getManagerAccount(manager1.address)
  //       const manager2After = await getManagerAccount(manager2.address)

  //       expect(manager1After.fund2UNI).to.equal(manager1Middle.fund2UNI.sub(withdrawAmountUNI))
  //       expect(manager2After.rewardTokens[0][0]).to.equal(WETH9) // weth9
  //       expect(manager2After.rewardTokens[0][1]).to.equal(manager2Middle.rewardTokens[0][1])
  //       expect(manager2After.rewardTokens[1][0]).to.equal(UNI) // uni
  //       expect(manager2After.rewardTokens[1][1])
  //         .to.equal(BigNumber.from(manager2Middle.rewardTokens[1][1]).add(fee)) // amount
  //       expect(fund2After.uni).to.equal(fund2Middle.uni.sub(investorWithdrawAmount))
  //     })

  //   })

  //   describe("(fund1) Provide liquidity manager1's token : ( ETH, UNI )", async function () {
      
  //     it("mint new position", async function () {

  //     })

  //     it("increase liquidity", async function () {

  //     })

  //     it("collect all fees", async function () {

  //     })

  //     it("decrease liquidity", async function () {

  //     })

  //   })

  //   describe("(fund2) Provide liquidity manager2's token : ( ETH, UNI )", async function () {

  //     it("mint new position", async function () {

  //     })

  //     it("increase liquidity", async function () {

  //     })

  //     it("collect all fees", async function () {

  //     })

  //     it("decrease liquidity", async function () {

  //     })

  //   })

  //   describe("(fund1) Provide liquidity manager1's token : ( UNI, USDC )", async function () {
      
  //     it("mint new position", async function () {

  //     })

  //     it("increase liquidity", async function () {

  //     })

  //     it("collect all fees", async function () {

  //     })

  //     it("decrease liquidity", async function () {

  //     })
      
  //   })

  // })

})