import { Wallet, constants, BigNumber, ContractTransaction, Contract } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { XXXFactory } from '../typechain-types/contracts/XXXFactory'
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2'
import { getCreate2Address } from './shared/utilities'
import { encodePath } from './shared/path'
import { 
  exactInputSingleParams,
  exactOutputSingleParams,
  exactInputParams,
  exactOutputParams,
} from './shared/swapRouter'
import { 
  WETH9_MAINNET,
  UNI_ADDRESS,
  DAI_ADDRESS,
  NULL_ADDRESS,
  V3_SWAP_ROUTER_ADDRESS,
  WETH_CHARGE_AMOUNT,
  DEPOSIT_AMOUNT,
  WITHDRAW_AMOUNT,
  MANAGER_FEE,
  WHITE_LIST_TOKENS,
  FeeAmount,
  V3TradeType,
  V3SwapType,
  V3TradeParams
} from "./shared/constants"



describe('XXXFund2', () => {

  let deployer: Wallet 
  let manager1: Wallet
  let manager2: Wallet
  let investor: Wallet
  let investor2: Wallet
  let notInvestor: Wallet

  let factoryContractAddress: string
  let fundContractAddress: string

  let fund1Address: string
  let fund2Address: string

  let factory: Contract
  let fund1: Contract
  let fund2: Contract
  let WETH9: Contract

  // let getBalances: (
  //   who: string
  // ) => Promise<{
  //   weth9: BigNumber
  //   token0: BigNumber
  //   token1: BigNumber
  //   token2: BigNumber
  // }>

  before('get signer', async () => {
    [ deployer,
      manager1,
      manager2,
      investor,
      investor2,
      notInvestor
    ] = await (ethers as any).getSigners()

    WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)

    // getBalances = async (who: string) => {
    //   const balances = await Promise.all([
    //     weth9.balanceOf(who),
    //     tokens[0].balanceOf(who),
    //     tokens[1].balanceOf(who),
    //     tokens[2].balanceOf(who),
    //   ])
    //   return {
    //     weth9: balances[0],
    //     token0: balances[1],
    //     token1: balances[2],
    //     token2: balances[3],
    //   }
    // }
  })

  before("Deploy XXXFactory Contract", async function () {
    const XXXFactory = await ethers.getContractFactory("XXXFactory")
    const Factory = await XXXFactory.connect(deployer).deploy()
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
    await factory.connect(manager1).createFund(manager1.address)
    const fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
    const expectedFundAddress = getCreate2Address(factoryContractAddress, manager1.address, fundBytecode)
    const savedFundAddress = await factory.connect(manager1).getFundByManager(manager1.address)
    expect(savedFundAddress).to.equal(expectedFundAddress)
    fund1Address = savedFundAddress
    fund1 = await ethers.getContractAt("XXXFund2", fund1Address)
  })

  it("create 2nd fund", async function () {
    await factory.connect(manager2).createFund(manager2.address)
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
      const managerWETHBefore = await WETH9.balanceOf(manager1.address)
      await WETH9.connect(manager1).deposit({
        from: manager1.address,
        value: WETH_CHARGE_AMOUNT
      })
      const managerWETHAfter = await WETH9.balanceOf(manager1.address)
      expect(managerWETHAfter).to.equal(managerWETHBefore.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH => receive()", async function () {
      const fundWETHBefore = await WETH9.balanceOf(fund1Address)

      await manager1.sendTransaction({
        to: fund1Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })

      //check investorTokenCount
      const investorTokenCount = await fund1.connect(manager1).investorTokenCount(manager1.address)
      //check investorTokens
      const managerWETH = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await fund1.connect(manager1).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(fund1Address)

      expect(investorTokenCount).to.equal(1)
      expect(managerWETH).to.equal(DEPOSIT_AMOUNT)
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.add(DEPOSIT_AMOUNT))
    })

    it("withdraw ETH", async function () {
      let beforeETHBalance = 0
      await manager1.getBalance().then((balance: any) => {
          beforeETHBalance = balance
      });
      const fundWETHBefore = await WETH9.balanceOf(fund1Address)
      const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)

      await fund1.connect(manager1).withdraw(WETH9_MAINNET, WITHDRAW_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await fund1.connect(manager1).investorTokenCount(manager1.address)
      //check investorTokens
      const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await fund1.connect(manager1).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(fund1Address)

      let afterETHBalance = 0
      await manager1.getBalance().then((balance: any) => {
          afterETHBalance = balance
      });

      expect(investorTokenCount).to.equal(1)
      expect(managerWETHAfter).to.equal(managerWETHBefore.sub(WITHDRAW_AMOUNT))
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.sub(WITHDRAW_AMOUNT))
      expect(afterETHBalance).to.be.above(beforeETHBalance)
    })

    it("deposit WETH", async function () {
      const fundWETHBefore = await WETH9.balanceOf(fund1Address)
      const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)

      await WETH9.connect(manager1).approve(fund1Address, constants.MaxUint256)
      await fund1.connect(manager1).deposit(WETH9_MAINNET, DEPOSIT_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await fund1.connect(manager1).investorTokenCount(manager1.address)
      //check investorTokens
      const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await fund1.connect(manager1).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(fund1Address)

      expect(investorTokenCount).to.equal(1)
      expect(managerWETHAfter).to.equal(managerWETHBefore.add(DEPOSIT_AMOUNT))
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.add(DEPOSIT_AMOUNT))
    })

    it("withdraw WETH", async function () {
      const fundWETHBefore = await WETH9.balanceOf(fund1Address)
      const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)

      await fund1.connect(manager1).withdraw(WETH9_MAINNET, WITHDRAW_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await fund1.connect(manager1).investorTokenCount(manager1.address)
      //check investorTokens
      const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await fund1.connect(manager1).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(fund1Address)

      expect(investorTokenCount).to.equal(1)
      expect(managerWETHAfter).to.equal(managerWETHBefore.sub(WITHDRAW_AMOUNT))
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.sub(WITHDRAW_AMOUNT))
    })


    describe('swap', () => {

      describe("#exactInputSingle", async function () {

        it("WETH -> UNI", async function () {
          const swapInputAmount = BigNumber.from(1000000)
          const amountOutMinimum = BigNumber.from(1)

          const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          const params = exactInputSingleParams(
            manager1.address,
            WETH9_MAINNET,
            UNI_ADDRESS,
            swapInputAmount,
            amountOutMinimum,
            BigNumber.from(0),
            fund1Address
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.equal(managerWETHBefore.sub(swapInputAmount))
          expect(managerUNIAfter).to.be.above(managerUNIBefore)
        })

        it("UNI -> WETH", async function () {
          const swapInputAmount = BigNumber.from(1000000)
          const amountOutMinimum = BigNumber.from(1)

          const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          const params = exactInputSingleParams(
            manager1.address,
            UNI_ADDRESS,
            WETH9_MAINNET, 
            swapInputAmount, 
            amountOutMinimum, 
            BigNumber.from(0),
            fund1Address
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.be.above(managerWETHBefore)
          expect(managerUNIAfter).to.equal(managerUNIBefore.sub(swapInputAmount))

        })

      })

      describe("#exactOutputSingle", async function () {

        it("WETH -> UNI", async function () {
          const swapOutputAmount = BigNumber.from(1000000)
          const amountInMaximum = BigNumber.from(100000)

          const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          const params = exactOutputSingleParams(
            manager1.address,
            WETH9_MAINNET, 
            UNI_ADDRESS, 
            swapOutputAmount, 
            amountInMaximum, 
            BigNumber.from(0),
            fund1Address
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.be.below(managerWETHBefore)
          expect(managerUNIAfter).to.equal(managerUNIBefore.add(swapOutputAmount))
        })

        it("UNI -> WETH", async function () {
          const swapOutputAmount = BigNumber.from(100000)
          const amountInMaximum = BigNumber.from(30000000)

          const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          const params = exactOutputSingleParams(
            manager1.address,
            UNI_ADDRESS,
            WETH9_MAINNET, 
            swapOutputAmount, 
            amountInMaximum, 
            BigNumber.from(0),
            fund1Address
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.equal(managerWETHBefore.add(swapOutputAmount))
          expect(managerUNIAfter).to.be.below(managerUNIBefore)
        })

      })

      describe("#exactInput", async function () {

        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
          const swapInputAmount = BigNumber.from(10000)
          const amountOutMinimum = BigNumber.from(1)

          const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          const params = exactInputParams(
            manager1.address,
            tokens,
            swapInputAmount,
            amountOutMinimum,
            fund1Address
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.equal(managerWETHBefore.sub(swapInputAmount))
          expect(managerUNIAfter).to.be.above(managerUNIBefore)
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI_ADDRESS, DAI_ADDRESS, WETH9_MAINNET]
          const swapInputAmount = BigNumber.from(3000000)
          const amountOutMinimum = BigNumber.from(1)

          const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          const params = exactInputParams(
            manager1.address,
            tokens,
            swapInputAmount,
            amountOutMinimum,
            fund1Address
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.be.above(managerWETHBefore)
          expect(managerUNIAfter).to.equal(managerUNIBefore.sub(swapInputAmount))
        })

      })

      describe("#exactOutput", async function () {

        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
          const swapOutputAmount = BigNumber.from(1000000)
          const amountInMaximum = BigNumber.from(100000)

          const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          const params = exactOutputParams(
            manager1.address,
            tokens,
            swapOutputAmount,
            amountInMaximum,
            fund1Address
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.be.below(managerWETHBefore)
          expect(managerUNIAfter).to.equal(managerUNIBefore.add(swapOutputAmount))
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI_ADDRESS, DAI_ADDRESS, WETH9_MAINNET]
          const swapOutputAmount = BigNumber.from(10000)
          const amountInMaximum = BigNumber.from(3000000)

          const managerWETHBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIBefore = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          const params = exactOutputParams(
            manager1.address,
            tokens,
            swapOutputAmount,
            amountInMaximum,
            fund1Address
          )
          await fund1.connect(manager1).swap(params, { value: 0 })

          const managerWETHAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, WETH9_MAINNET)
          const managerUNIAfter = await fund1.connect(manager1).getInvestorTokenAmount(manager1.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.equal(managerWETHBefore.add(swapOutputAmount))
          expect(managerUNIAfter).to.be.below(managerUNIBefore)

        })

      })

    })

  })

  describe('user : manager1, investor', () => {

    it("investor not register yet => manager1", async function () {
      expect(await factory.connect(investor).isInvestorFundExist(investor.address, fund1Address)).to.be.false
    })

    it("investor not register yet => deposit, withdraw swap fail", async function () {
      await expect(investor.sendTransaction({
        to: fund1Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })).to.be.reverted

      await WETH9.connect(investor).approve(fund1Address, constants.MaxUint256)
      
      //deposit, withdraw
      await expect(fund1.connect(investor).deposit(WETH9_MAINNET, DEPOSIT_AMOUNT)).to.be.reverted
      await expect(fund1.connect(investor).withdraw(WETH9_MAINNET, WITHDRAW_AMOUNT)).to.be.reverted
      //swap exactInput
      const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
      const swapInputAmount = BigNumber.from(10000)
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        manager1.address,
        tokens,
        swapInputAmount,
        amountOutMinimum,
        fund1Address
      )
      await expect(fund1.connect(investor).swap(params, { value: 0 })).to.be.reverted
    })

    it("investor register => manager1", async function () {
      await factory.connect(investor).addInvestorFundList(fund1Address)
    })

    it("check investor registered", async function () {
      const isRegistered = await factory.connect(investor).isInvestorFundExist(investor.address, fund1Address)
      expect(isRegistered).to.be.true
    })

    it("ETH -> WETH", async function () {
      const beforeWETHBalance = await WETH9.balanceOf(investor.address)
      await WETH9.connect(investor).deposit({
                from: investor.address,
                value: WETH_CHARGE_AMOUNT
            })
      const afterWETHBalance = await WETH9.balanceOf(investor.address)
      expect(afterWETHBalance).to.equal(beforeWETHBalance.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH => receive() ( MANAGER_FEE 1% )", async function () {
      const fundWETHBefore = await WETH9.balanceOf(fund1Address)
      await investor.sendTransaction({
        to: fund1Address,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })

      //check investorTokenCount
      const investorTokenCount = await fund1.connect(investor).investorTokenCount(investor.address)
      //check investorTokens
      const investorWETH = await fund1.connect(investor).getInvestorTokenAmount(investor.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await fund1.connect(investor).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(fund1Address)

      expect(investorTokenCount).to.equal(1)
      expect(investorWETH).to.equal(DEPOSIT_AMOUNT)
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.add(DEPOSIT_AMOUNT))
    })

    it("withdraw ETH ( MANAGER_FEE 1% )", async function () {
      let beforeETHBalance = 0
      await investor.getBalance().then((balance: any) => {
          beforeETHBalance = balance
      });
      const fundWETHBefore = await WETH9.balanceOf(fund1Address)
      const investorWETHBefore = await fund1.connect(investor).getInvestorTokenAmount(investor.address, WETH9_MAINNET)
 
      await fund1.connect(investor).withdraw(WETH9_MAINNET, WITHDRAW_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await fund1.connect(investor).investorTokenCount(investor.address)
      //check investorTokens
      const investorWETHAfter = await fund1.connect(investor).getInvestorTokenAmount(investor.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await fund1.connect(investor).getRewardTokens()
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(fund1Address)

      let afterETHBalance = 0
      await investor.getBalance().then((balance: any) => {
          afterETHBalance = balance
      });

      expect(investorTokenCount).to.equal(1)
      expect(investorWETHAfter).to.equal(investorWETHBefore.sub(WITHDRAW_AMOUNT))
      expect(rewardTokens[0].tokenAddress).to.equal(WETH9_MAINNET)
      expect(rewardTokens[0].amount).to.equal(fee)
      expect(fundWETHAfter).to.equal(fundWETHBefore.sub(investorWithdrawAmount))
      expect(afterETHBalance).to.be.above(beforeETHBalance)
    })

    it("deposit WETH ( MANAGER_FEE 1% )", async function () {
      const fundWETHBefore = await WETH9.balanceOf(fund1Address)
      const investorWETHBefore = await fund1.connect(investor).getInvestorTokenAmount(investor.address, WETH9_MAINNET)
      const rewardTokensBefore = await fund1.connect(investor).getRewardTokens()
      const rewardAmountBefore = rewardTokensBefore[0].amount

      await WETH9.connect(investor).approve(fund1Address, constants.MaxUint256)
      await fund1.connect(investor).deposit(WETH9_MAINNET, DEPOSIT_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await fund1.connect(investor).investorTokenCount(investor.address)
      //check investorTokens
      const investorWETHAfter = await fund1.connect(investor).getInvestorTokenAmount(investor.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokensAfter = await fund1.connect(investor).getRewardTokens()
      const rewardAmountAfter = rewardTokensAfter[0].amount
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(fund1Address)

      expect(investorTokenCount).to.equal(1)
      expect(investorWETHAfter).to.equal(investorWETHBefore.add(DEPOSIT_AMOUNT))
      expect(rewardAmountBefore).to.equal(rewardAmountAfter)
      expect(fundWETHAfter).to.equal(fundWETHBefore.add(DEPOSIT_AMOUNT))
    })

    it("withdraw WETH ( MANAGER_FEE 1% )", async function () {
      const fundWETHBefore = await WETH9.balanceOf(fund1Address)
      const investorWETHBefore = await fund1.connect(investor).getInvestorTokenAmount(investor.address, WETH9_MAINNET)
      const rewardTokensBefore = await fund1.connect(investor).getRewardTokens()
      const rewardAmountBefore = rewardTokensBefore[0].amount

      await fund1.connect(investor).withdraw(WETH9_MAINNET, WITHDRAW_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await fund1.connect(investor).investorTokenCount(investor.address)
      //check investorTokens
      const investorWETHAfter = await fund1.connect(investor).getInvestorTokenAmount(investor.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokensAfter = await fund1.connect(investor).getRewardTokens()
      const rewardAmountAfter = await rewardTokensAfter[0].amount
      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(fund1Address)

      expect(investorTokenCount).to.equal(1)
      expect(investorWETHAfter).to.equal(investorWETHBefore.sub(WITHDRAW_AMOUNT))
      expect(rewardAmountAfter).to.equal(rewardAmountBefore.add(fee))
      expect(fundWETHAfter).to.equal(fundWETHBefore.sub(investorWithdrawAmount))
    })

    describe("swap reverted", async function () {

      it("#exactInputSingle", async function () {
        const swapInputAmount = BigNumber.from(1000000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputSingleParams(
          investor.address,
          WETH9_MAINNET,
          UNI_ADDRESS, 
          swapInputAmount, 
          amountOutMinimum, 
          BigNumber.from(0),
          fund1Address
        )
        await expect(fund1.connect(investor).swap(params, { value: 0 })).to.be.reverted
      })

      it("#exactOutputSingle", async function () {
        const swapOutputAmount = BigNumber.from(1000000)
        const amountInMaximum = BigNumber.from(100000)

        const params = exactOutputSingleParams(
          investor.address,
          WETH9_MAINNET, 
          UNI_ADDRESS, 
          swapOutputAmount, 
          amountInMaximum, 
          BigNumber.from(0),
          fund1Address
        )
        await expect(fund1.connect(investor).swap(params, { value: 0 })).to.be.reverted
      })

      it("#exactInput", async function () {
        const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactInputParams(
          investor.address,
          tokens,
          swapInputAmount,
          amountOutMinimum,
          fund1Address
        )
        await expect(fund1.connect(investor).swap(params, { value: 0 })).to.be.reverted
      })

      it("#exactOutput", async function () {
        const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
        const swapInputAmount = BigNumber.from(10000)
        const amountOutMinimum = BigNumber.from(1)

        const params = exactOutputParams(
          investor.address,
          tokens,
          swapInputAmount,
          amountOutMinimum,
          fund1Address
        )
        await expect(fund1.connect(investor).swap(params, { value: 0 })).to.be.reverted
      })

    })

  })

  describe('user : manager1, manager2', () => {

    it("manager1 not register yet => manager2 ", async function () {
      expect(await factory.connect(manager1).isInvestorFundExist(manager1.address, fund2Address)).to.be.false
    })

    it("manager2 not register yet => manager1", async function () {
      expect(await factory.connect(manager2).isInvestorFundExist(manager2.address, fund1Address)).to.be.false
    })

    // it("manager1 not register yet => manager2, deposit, withdraw swap fail", async function () {
      
    //   await expect(investor.sendTransaction({
    //     to: fund1Address,
    //     value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
    //   })).to.be.reverted

    //   await WETH9.connect(investor).approve(fund1Address, constants.MaxUint256)
      
    //   //deposit, withdraw
    //   await expect(fund1.connect(investor).deposit(WETH9_MAINNET, DEPOSIT_AMOUNT)).to.be.reverted
    //   await expect(fund1.connect(investor).withdraw(WETH9_MAINNET, WITHDRAW_AMOUNT)).to.be.reverted
    //   //swap exactInput
    //   const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
    //   const swapInputAmount = BigNumber.from(10000)
    //   const amountOutMinimum = BigNumber.from(1)
    //   const params = exactInputParams(
    //     manager1.address,
    //     tokens,
    //     swapInputAmount,
    //     amountOutMinimum,
    //     fund1Address
    //   )
    //   await expect(fund1.connect(investor).swap(params, { value: 0 })).to.be.reverted
    // })

    // it("manager2 not register yet => manager1, deposit, withdraw swap fail", async function () {


    // })

    // it("manager1 register => manager2", async function () {
    //   factory.connect(manager1).addInvestorFundList(fund2Address)
    // })
    // it("manager2 register => manager1", async function () {
    //   factory.connect(manager2).addInvestorFundList(fund1Address)
    // })
    // it("now check manager1, manager2 registered", async function () {
    //   expect(await factory.connect(manager1).isInvestorFundExist(investor.address, fund1Address)).to.be.true
    // })

  })

})