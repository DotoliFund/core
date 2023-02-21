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


describe('Liquidity', () => {

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


  describe("manager1's liquidity token in fund2 : ( ETH, UNI )", async function () {

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
      await fund.connect(manager2).mintNewPosition(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )
    })

    it("increase liquidity", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const params = increaseParams(
        tokenIds[0],
        BigNumber.from(200000),
        BigNumber.from(1000),
        BigNumber.from(20000),
        BigNumber.from(100),
      )
      await fund.connect(manager2).increaseLiquidity(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )
    })

    it("LiquidityRouter get token0, token1, amount0, amount1", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const tokenAmount = await oracle.connect(manager2).getPositionTokenAmount(tokenIds[0])
    })

    it("collect position fee", async function () {
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

    it("decrease liquidity", async function () {
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
  })


  describe("manager2's liquidity token in fund2 : ( ETH, UNI )", async function () {

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
      await fund.connect(manager2).mintNewPosition(
        fundId2,
        manager2.address,
        params, 
        { value: 0 }
      )
    })

    it("increase liquidity", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager2.address)
      const params = increaseParams(
        tokenIds[0],
        BigNumber.from(200000),
        BigNumber.from(1000),
        BigNumber.from(20000),
        BigNumber.from(100),
      )
      await fund.connect(manager2).increaseLiquidity(
        fundId2,
        manager2.address,
        params, 
        { value: 0 }
      )
    })

    it("LiquidityRouter get token0, token1, amount0, amount1", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager2.address)
      const tokenAmount = await oracle.connect(manager2).getPositionTokenAmount(tokenIds[0])
    })

    it("collect position fee", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager2.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )
      await fund.connect(manager2).collectPositionFee(
        fundId2,
        manager2.address,
        params, 
        { value: 0 }
      )
    })

    it("decrease liquidity", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager2.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await fund.connect(manager2).decreaseLiquidity(
        fundId2,
        manager2.address,
        params, 
        { value: 0 }
      )
    })
  })

  describe("manager1's invalid liquidity request on fund2 ", async function () {

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
      await expect(fund.connect(manager2).mintNewPosition(
        fundId2,
        investor2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("get manager1, manager2 position's token0, token1, amount0, amount1 in fund2", async function () {
      const manager1TokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const manager1TokenAmount = await oracle.connect(manager2).getPositionTokenAmount(manager1TokenIds[0])
      const manager2TokenIds = await info.connect(manager2).getTokenIds(fundId2, manager2.address)
      const manager2TokenAmount = await oracle.connect(manager2).getPositionTokenAmount(manager2TokenIds[0])
    })

    it("get manager1, manager2 investor tokens in fund2", async function () {
      const manager1Tokens = await info.connect(manager2).getInvestorTokens(fundId2, manager1.address)
      const manager1Token0 = manager1Tokens[0].tokenAddress
      const manager1Token1 = manager1Tokens[1].tokenAddress
      const manager1Amount0 = manager1Tokens[0].amount
      const manager1Amount1 = manager1Tokens[1].amount
      // console.log('manager1 token0 address :', manager1Token0)
      // console.log('manager1 token0 amount :', manager1Amount0)
      // console.log('manager1 token1 address :', manager1Token1)
      // console.log('manager1 token1 amount :', manager1Amount1)

      const manager2Tokens = await info.connect(manager2).getInvestorTokens(fundId2, manager2.address)
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
      await expect(fund.connect(manager2).mintNewPosition(
        fundId2,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("reset UNI from white list token", async function () {
      await expect(setting.connect(deployer).resetWhiteListToken(UNI))
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
      await expect(fund.connect(manager2).mintNewPosition(
        fundId2,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("set UNI to white list token", async function () {
      await expect(setting.connect(deployer).setWhiteListToken(UNI))
    })

    it("increase liquidity -> wrong investor", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const params = increaseParams(
        tokenIds[0],
        BigNumber.from(20000),
        BigNumber.from(100),
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await expect(fund.connect(manager2).increaseLiquidity(
        fundId2,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("increase liquidity -> wrong tokenId", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager2.address)
      const params = increaseParams(
        tokenIds[0],
        UNI,
        WETH9,
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

    it("increase liquidity -> too many token amount", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const params = increaseParams(
        tokenIds[0],
        BigNumber.from(600000000),
        BigNumber.from(3000000),
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

    it("collect position fee -> wrong investor", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )
      await expect(fund.connect(manager2).collectPositionFee(
        fundId2,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("collect position fee -> wrong tokenId", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager2.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )
      await expect(fund.connect(manager2).collectPositionFee(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("decrease liquidity -> wrong investor", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await expect(fund.connect(manager2).decreaseLiquidity(
        fundId2,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("decrease liquidity -> wrong tokenId", async function () {
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager2.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await expect(fund.connect(manager2).decreaseLiquidity(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("decrease liquidity -> too many liquidity", async function () {
      const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
      //console.log(tokenIdInfo.liquidity)

      const params = decreaseParams(
        tokenIds[0],
        200000,
        BigNumber.from(200000),
        BigNumber.from(1000),
      )
      await expect(fund.connect(manager2).decreaseLiquidity(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("decrease liquidity -> too many token amount", async function () {
      const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
      const tokenIds = await info.connect(manager2).getTokenIds(fundId2, manager1.address)
      const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
      //console.log(tokenIdInfo.liquidity)

      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(20000),
        BigNumber.from(100),
      )
      await expect(fund.connect(manager2).decreaseLiquidity(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("fee out -> not manager", async function () {
      await expect(fund.connect(manager1).withdrawFee(fundId2, UNI, 100000)).to.be.reverted
    })

    it("fee out -> too many token amount", async function () {
      const feeTokens = await info.connect(manager2).getFeeTokens(fundId2)
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
      const manager1Tokens = await info.connect(manager1).getInvestorTokens(fundId1, manager1.address)
      //console.log(manager1Tokens)

      const manager1Token0 = manager1Tokens[0].tokenAddress
      const manager1Token1 = manager1Tokens[1].tokenAddress
      const manager1Amount0 = manager1Tokens[0].amount
      const manager1Amount1 = manager1Tokens[1].amount
      // console.log('manager1 token0 address :', manager1Token0)
      // console.log('manager1 token0 amount :', manager1Amount0)
      // console.log('manager1 token1 address :', manager1Token1)
      // console.log('manager1 token1 amount :', manager1Amount1)

      const manager2Tokens = await info.connect(manager1).getInvestorTokens(fundId1, manager2.address)
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
      await fund.connect(manager1).mintNewPosition(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )
    })

    it("increase liquidity", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const params = increaseParams(
        tokenIds[0],
        BigNumber.from(200000),
        BigNumber.from(1000),
        BigNumber.from(20000),
        BigNumber.from(100),
      )
      await fund.connect(manager1).increaseLiquidity(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )
    })

    it("LiquidityRouter get token0, token1, amount0, amount1", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const tokenAmount = await oracle.connect(manager2).getPositionTokenAmount(tokenIds[0])
    })

    it("collect position fee", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )
      await fund.connect(manager1).collectPositionFee(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )
    })

    it("decrease liquidity", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await fund.connect(manager1).decreaseLiquidity(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )
    })

    it("get manager1, manager2 position's token0, token1, amount0, amount1 in fund1", async function () {
      const manager1TokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
      const manager1TokenAmount = await oracle.connect(manager1).getPositionTokenAmount(manager1TokenIds[0])
      const manager2TokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const manager2TokenAmount = await oracle.connect(manager1).getPositionTokenAmount(manager2TokenIds[0])
      // console.log('manager1 tokenId :', manager1TokenAmount)
      // console.log('manager2 tokenId :', manager2TokenAmount)
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
        investor2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("mint new position -> too many token amount", async function () {
      const params = mintParams(
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
      await expect(fund.connect(manager1).mintNewPosition(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("reset UNI from white list token", async function () {
      await expect(setting.connect(deployer).resetWhiteListToken(UNI))
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
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("set UNI to white list token", async function () {
      await expect(setting.connect(deployer).setWhiteListToken(UNI))
    })

    it("increase liquidity -> wrong investor", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
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

    it("increase liquidity -> wrong tokenId", async function () {
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
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("get manager1, manager2 position's token0, token1, amount0, amount1 in fund1", async function () {
      const manager1TokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
      const manager1TokenAmount = await oracle.connect(manager1).getPositionTokenAmount(manager1TokenIds[0])
      const manager2TokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const manager2TokenAmount = await oracle.connect(manager1).getPositionTokenAmount(manager2TokenIds[0])
      // console.log('manager1 tokenId :', manager1TokenAmount)
      // console.log('manager2 tokenId :', manager2TokenAmount)
    })

    it("increase liquidity -> too many token amount", async function () {
      const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
      // console.log(tokenIdInfo.liquidity)

      const params = increaseParams(
        tokenIds[0],
        BigNumber.from(300000),
        BigNumber.from(60000000),
        BigNumber.from(1000),
        BigNumber.from(200000),
      )
      await expect(fund.connect(manager1).increaseLiquidity(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("collect position fee -> wrong investor", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
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

    it("collect position fee -> wrong tokenId", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )
      await expect(fund.connect(manager1).collectPositionFee(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("decrease liquidity -> wrong investor", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
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

    it("decrease liquidity -> wrong tokenId", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      await expect(fund.connect(manager1).decreaseLiquidity(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("decrease liquidity -> too many liquidity", async function () {
      const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
      //console.log(tokenIdInfo.liquidity)

      const params = decreaseParams(
        tokenIds[0],
        20000000,
        BigNumber.from(200000),
        BigNumber.from(1000),
      )
      await expect(fund.connect(manager1).decreaseLiquidity(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("decrease liquidity -> too many token amount", async function () {
      const nonfungiblePositionManager = await ethers.getContractAt("INonfungiblePositionManager", NonfungiblePositionManager)
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const tokenIdInfo = await nonfungiblePositionManager.positions(tokenIds[0])
      //console.log(tokenIdInfo.liquidity)

      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(200000),
        BigNumber.from(1000),
      )
      await expect(fund.connect(manager1).decreaseLiquidity(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("fee out -> not manager", async function () {
      await expect(fund.connect(manager2).withdrawFee(fundId1, UNI, 100000)).to.be.reverted
    })

    it("fee out -> too many token amount", async function () {
      const feeTokens = await info.connect(manager1).getFeeTokens(fundId1)
      await expect(fund.connect(manager1).withdrawFee(fundId1, UNI, 2000000000)).to.be.reverted
    })
  })

})