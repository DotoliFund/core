import { Wallet, constants, BigNumber, ContractTransaction } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { XXXFactory } from '../typechain-types/contracts/XXXFactory'
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2'
import { getCreate2Address } from './shared/utilities'
import { encodePath } from './shared/path'
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

  describe('sender : manager', () => {

    let deployer: Wallet, manager: Wallet

    let FactoryContractAddress = ''
    let FundContractAddress = ''
    let NewFundAddress = ''

    let fundBytecode = ''

    before('get signer', async () => {
      [deployer, manager] = await (ethers as any).getSigners()
    })

    before('load fund bytecode', async () => {
      fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
    })

    before("Deploy XXXFactory Contract", async function () {
      const XXXFactory = await ethers.getContractFactory("XXXFactory")
      const Factory = await XXXFactory.connect(deployer).deploy()
      await Factory.deployed()
      FactoryContractAddress = Factory.address
    })

    before("Deploy XXXFund2 Contract", async function () {
      const XXXFund = await ethers.getContractFactory("XXXFund2")
      const Fund = await XXXFund.connect(deployer).deploy()
      await Fund.deployed()
      FundContractAddress = Fund.address
    })

    it("createFund()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      await FactoryContract.connect(manager).createFund(manager.address)
      const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
      const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
      expect(savedFundAddress).to.equal(expectedFundAddress)
      NewFundAddress = expectedFundAddress
    })

    it("factory", async function () {
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      expect(await newFundContract.connect(manager).factory()).to.equal(FactoryContractAddress)
    })

    it("manager", async function () {
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      expect(await newFundContract.connect(manager).manager()).to.equal(manager.address)
    })

    it("ETH -> WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const managerWETHBefore = await WETH9.balanceOf(manager.address)
      await WETH9.connect(manager).deposit({
                from: manager.address,
                value: WETH_CHARGE_AMOUNT
            })
      const managerWETHAfter = await WETH9.balanceOf(manager.address)
      expect(managerWETHAfter).to.equal(managerWETHBefore.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH => receive()", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

      const fundWETHBefore = await WETH9.balanceOf(NewFundAddress)

      await manager.sendTransaction({
        to: NewFundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })

      //check investorTokenCount
      const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
      //check investorTokens
      const managerWETH = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(NewFundAddress)

      expect(investorTokenCount).to.equal(1)
      expect(managerWETH).to.equal(DEPOSIT_AMOUNT)
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.add(DEPOSIT_AMOUNT))
    })

    it("withdraw ETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

      let beforeETHBalance = 0
      await manager.getBalance().then((balance: any) => {
          beforeETHBalance = balance
      });
      const fundWETHBefore = await WETH9.balanceOf(NewFundAddress)
      const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
 
      await newFundContract.connect(manager).withdraw(manager.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
      //check investorTokens
      const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(NewFundAddress)

      let afterETHBalance = 0
      await manager.getBalance().then((balance: any) => {
          afterETHBalance = balance
      });

      expect(investorTokenCount).to.equal(1)
      expect(managerWETHAfter).to.equal(managerWETHBefore.sub(WITHDRAW_AMOUNT))
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.sub(WITHDRAW_AMOUNT))
      expect(afterETHBalance).to.be.above(beforeETHBalance)
    })

    it("deposit WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

      const fundWETHBefore = await WETH9.balanceOf(NewFundAddress)
      const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)

      await WETH9.connect(manager).approve(NewFundAddress, constants.MaxUint256)
      await newFundContract.connect(manager).deposit(manager.address, WETH9_MAINNET, DEPOSIT_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
      //check investorTokens
      const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(NewFundAddress)

      expect(investorTokenCount).to.equal(1)
      expect(managerWETHAfter).to.equal(managerWETHBefore.add(DEPOSIT_AMOUNT))
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.add(DEPOSIT_AMOUNT))
    })

    it("withdraw WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

      const fundWETHBefore = await WETH9.balanceOf(NewFundAddress)
      const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)

      await newFundContract.connect(manager).withdraw(manager.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
      //check investorTokens
      const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(NewFundAddress)

      expect(investorTokenCount).to.equal(1)
      expect(managerWETHAfter).to.equal(managerWETHBefore.sub(WITHDRAW_AMOUNT))
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.sub(WITHDRAW_AMOUNT))
    })


    describe('swap', () => {

      describe("#exactInputSingle", async function () {

        async function exactInputSingle(
          tokenIn: string,
          tokenOut: string,
          amountIn: BigNumber,
          amountOutMinimum: BigNumber,
          sqrtPriceLimitX96: BigNumber
        ): Promise<ContractTransaction> {

          const value = 0

          const params: V3TradeParams[] = [
            {
              tradeType: V3TradeType.EXACT_INPUT,
              swapType: V3SwapType.SINGLE_HOP,
              investor: manager.address,
              tokenIn: tokenIn,
              tokenOut: tokenOut,
              recipient: NewFundAddress,
              fee: FeeAmount.MEDIUM,
              amountIn,
              amountOut: BigNumber.from(0),
              amountInMaximum: BigNumber.from(0),
              amountOutMinimum,
              sqrtPriceLimitX96: sqrtPriceLimitX96 ?? BigNumber.from(0),
              path: '0x1234'
            }
          ]

          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
          return newFundContract.connect(manager).swap(params, { value })
        }

        it("WETH -> UNI", async function () {
          const swapInputAmount = BigNumber.from(1000000)
          const amountOutMinimum = BigNumber.from(1)
          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

          const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          await exactInputSingle(
            WETH9_MAINNET, 
            UNI_ADDRESS, 
            swapInputAmount, 
            amountOutMinimum, 
            BigNumber.from(0)
          )

          const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.equal(managerWETHBefore.sub(swapInputAmount))
          expect(managerUNIAfter).to.be.above(managerUNIBefore)
        })

        it("UNI -> WETH", async function () {
          const swapInputAmount = BigNumber.from(1000000)
          const amountOutMinimum = BigNumber.from(1)

          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

          const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          await exactInputSingle(
            UNI_ADDRESS,
            WETH9_MAINNET, 
            swapInputAmount, 
            amountOutMinimum, 
            BigNumber.from(0)
          )

          const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.be.above(managerWETHBefore)
          expect(managerUNIAfter).to.equal(managerUNIBefore.sub(swapInputAmount))

        })

      })

      describe("#exactOutputSingle", async function () {

        async function exactOutputSingle(
          tokenIn: string,
          tokenOut: string,
          amountOut: BigNumber,
          amountInMaximum: BigNumber,
          sqrtPriceLimitX96: BigNumber
        ): Promise<ContractTransaction> {

          const value = 0

          const params: V3TradeParams[] = [
            {
              tradeType: V3TradeType.EXACT_OUTPUT,
              swapType: V3SwapType.SINGLE_HOP,
              investor: manager.address,
              tokenIn: tokenIn,
              tokenOut: tokenOut,
              recipient: NewFundAddress,
              fee: FeeAmount.MEDIUM,
              amountIn: BigNumber.from(0),
              amountOut,
              amountInMaximum,
              amountOutMinimum: BigNumber.from(0),
              sqrtPriceLimitX96: sqrtPriceLimitX96 ?? BigNumber.from(0),
              path: '0x1234'
            }
          ]
          
          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
          return newFundContract.connect(manager).swap(params, { value })
        }

        it("WETH -> UNI", async function () {
          const swapOutputAmount = BigNumber.from(1000000)
          const amountInMaximum = BigNumber.from(100000)
          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

          const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          await exactOutputSingle(
            WETH9_MAINNET, 
            UNI_ADDRESS, 
            swapOutputAmount, 
            amountInMaximum, 
            BigNumber.from(0)
          )

          const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.be.below(managerWETHBefore)
          expect(managerUNIAfter).to.equal(managerUNIBefore.add(swapOutputAmount))
        })

        it("UNI -> WETH", async function () {
          const swapOutputAmount = BigNumber.from(100000)
          const amountInMaximum = BigNumber.from(30000000)
          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

          const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          await exactOutputSingle(
            UNI_ADDRESS,
            WETH9_MAINNET, 
            swapOutputAmount, 
            amountInMaximum, 
            BigNumber.from(0)
          )

          const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.equal(managerWETHBefore.add(swapOutputAmount))
          expect(managerUNIAfter).to.be.below(managerUNIBefore)
        })

      })

      describe("#exactInput", async function () {

        async function exactInput(
          tokens: string[],
          amountIn: BigNumber,
          amountOutMinimum: BigNumber
        ): Promise<ContractTransaction> {

          const value = 0
          const path = encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))

          const params: V3TradeParams[] = [
            {
              tradeType: V3TradeType.EXACT_INPUT,
              swapType: V3SwapType.MULTI_HOP,
              investor: manager.address,
              tokenIn: NULL_ADDRESS,
              tokenOut: NULL_ADDRESS,
              recipient: NewFundAddress,
              fee: 0,
              amountIn,
              amountOut: BigNumber.from(0),
              amountInMaximum: BigNumber.from(0),
              amountOutMinimum,
              sqrtPriceLimitX96: BigNumber.from(0),
              path: path
            }
          ]

          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
          return newFundContract.connect(manager).swap(params, { value })
        }

        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
          const swapInputAmount = BigNumber.from(10000)
          const amountOutMinimum = BigNumber.from(1)
          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

          const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          await exactInput(
            tokens,
            swapInputAmount,
            amountOutMinimum
          )

          const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.equal(managerWETHBefore.sub(swapInputAmount))
          expect(managerUNIAfter).to.be.above(managerUNIBefore)
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI_ADDRESS, DAI_ADDRESS, WETH9_MAINNET]
          const swapInputAmount = BigNumber.from(3000000)
          const amountOutMinimum = BigNumber.from(1)

          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

          const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          await exactInput(
            tokens,
            swapInputAmount,
            amountOutMinimum
          )

          const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.be.above(managerWETHBefore)
          expect(managerUNIAfter).to.equal(managerUNIBefore.sub(swapInputAmount))
        })

      })

      describe("#exactOutput", async function () {

        async function exactOutput(
          tokens: string[],
          amountOut: BigNumber,
          amountInMaximum: BigNumber
        ): Promise<ContractTransaction> {

          const value = 0
          const path = encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
          const params: V3TradeParams[] = [
            {
              tradeType: V3TradeType.EXACT_OUTPUT,
              swapType: V3SwapType.MULTI_HOP,
              investor: manager.address,
              tokenIn: NULL_ADDRESS,
              tokenOut: NULL_ADDRESS,
              recipient: NewFundAddress,
              fee: 0,
              amountIn: BigNumber.from(0),
              amountOut,
              amountInMaximum,
              amountOutMinimum: BigNumber.from(0),
              sqrtPriceLimitX96: BigNumber.from(0),
              path: path
            }
          ]

          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
          return newFundContract.connect(manager).swap(params, { value })
        }


        it("WETH -> DAI -> UNI", async function () {
          const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
          const swapOutputAmount = BigNumber.from(1000000)
          const amountInMaximum = BigNumber.from(100000)
          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

          const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          await exactOutput(
            tokens,
            swapOutputAmount,
            amountInMaximum
          )

          const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.be.below(managerWETHBefore)
          expect(managerUNIAfter).to.equal(managerUNIBefore.add(swapOutputAmount))
        })

        it("UNI -> DAI -> WETH", async function () {
          const tokens = [UNI_ADDRESS, DAI_ADDRESS, WETH9_MAINNET]
          const swapOutputAmount = BigNumber.from(10000)
          const amountInMaximum = BigNumber.from(3000000)

          const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

          const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          await exactOutput(
            tokens,
            swapOutputAmount,
            amountInMaximum
          )

          const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
          const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

          expect(managerWETHAfter).to.equal(managerWETHBefore.add(swapOutputAmount))
          expect(managerUNIAfter).to.be.below(managerUNIBefore)

        })

      })

    })

  })


  describe('sender : investor', () => {
  
    let deployer: Wallet, manager: Wallet, investor: Wallet

    let FactoryContractAddress = ''
    let FundContractAddress = ''
    let NewFundAddress = ''

    let fundBytecode = ''

    before('get signer', async () => {
      [deployer, manager, investor] = await (ethers as any).getSigners()
    })
    before('load fund bytecode', async () => {
      fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
    })

    before("Deploy XXXFactory Contract", async function () {
      const XXXFactory = await ethers.getContractFactory("XXXFactory")
      const Factory = await XXXFactory.connect(deployer).deploy()
      await Factory.deployed()
      FactoryContractAddress = Factory.address
    })

    before("Deploy XXXFund2 Contract", async function () {
      const XXXFund = await ethers.getContractFactory("XXXFund2")
      const Fund = await XXXFund.connect(deployer).deploy()
      await Fund.deployed()
      FundContractAddress = Fund.address
    })

    it("createFund()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      await FactoryContract.connect(manager).createFund(manager.address)
      const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
      const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
      expect(savedFundAddress).to.equal(expectedFundAddress)
      NewFundAddress = expectedFundAddress
    })

    //investor is different from not investor at addInvestorFundList(), isInvestorFundExist()
    it("not investor yet => isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).isInvestorFundExist(investor.address, NewFundAddress)).to.be.false
    })
    it("not investor yet => deposit, withdraw swap fail", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      
      await expect(investor.sendTransaction({
        to: NewFundAddress,
        value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
      })).to.be.reverted

      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      await WETH9.connect(investor).approve(NewFundAddress, constants.MaxUint256)
      await expect(newFundContract.connect(investor).deposit(investor.address, WETH9_MAINNET, DEPOSIT_AMOUNT)).to.be.reverted
      //TODO fix error
      //await expect(newFundContract.connect(investor).withdraw(investor.address, WETH9_MAINNET, WITHDRAW_AMOUNT)).to.be.reverted

      expect(await FactoryContract.connect(investor).isInvestorFundExist(investor.address, NewFundAddress)).to.be.false
    })
    it("register investor => addInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      FactoryContract.connect(investor).addInvestorFundList(NewFundAddress)
    })
    it("now check investor => isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).isInvestorFundExist(investor.address, NewFundAddress)).to.be.true
    })

    it("ETH -> WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeWETHBalance = await WETH9.balanceOf(investor.address)
      await WETH9.connect(investor).deposit({
                from: investor.address,
                value: WETH_CHARGE_AMOUNT
            })
      const afterWETHBalance = await WETH9.balanceOf(investor.address)
      expect(afterWETHBalance).to.equal(beforeWETHBalance.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH => receive()", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const fundWETHBefore = await WETH9.balanceOf(NewFundAddress)
      await investor.sendTransaction({
        to: NewFundAddress,
        value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
      })

      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      //check investorTokenCount
      const investorTokenCount = await newFundContract.connect(investor).investorTokenCount(investor.address)
      //check investorTokens
      const investorWETH = await newFundContract.connect(investor).getInvestorTokenAmount(investor.address, WETH9_MAINNET)
      //check rewardTokens
      const rewardTokens = await newFundContract.connect(investor).getRewardTokens()
      //check fund balance
      const fundWETHAfter = await WETH9.balanceOf(NewFundAddress)

      expect(investorTokenCount).to.equal(1)
      expect(investorWETH).to.equal(DEPOSIT_AMOUNT)
      expect(rewardTokens).to.be.empty
      expect(fundWETHAfter).to.equal(fundWETHBefore.add(DEPOSIT_AMOUNT))
    })

    // it("withdraw ETH", async function () {
    //   const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
    //   const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //   let beforeETHBalance = 0
    //   await manager.getBalance().then((balance: any) => {
    //       beforeETHBalance = balance
    //   });
    //   const fundWETHBefore = await WETH9.balanceOf(NewFundAddress)
    //   const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
 
    //   await newFundContract.connect(manager).withdraw(manager.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

    //   //check investorTokenCount
    //   const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
    //   //check investorTokens
    //   const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //   //check rewardTokens
    //   const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
    //   //check fund balance
    //   const fundWETHAfter = await WETH9.balanceOf(NewFundAddress)

    //   let afterETHBalance = 0
    //   await manager.getBalance().then((balance: any) => {
    //       afterETHBalance = balance
    //   });

    //   expect(investorTokenCount).to.equal(1)
    //   expect(managerWETHAfter).to.equal(managerWETHBefore.sub(WITHDRAW_AMOUNT))
    //   expect(rewardTokens).to.be.empty
    //   expect(fundWETHAfter).to.equal(fundWETHBefore.sub(WITHDRAW_AMOUNT))
    //   expect(afterETHBalance).to.be.above(beforeETHBalance)
    // })

    // it("deposit WETH", async function () {
    //   const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
    //   const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //   const fundWETHBefore = await WETH9.balanceOf(NewFundAddress)
    //   const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)

    //   await WETH9.connect(manager).approve(NewFundAddress, constants.MaxUint256)
    //   await newFundContract.connect(manager).deposit(manager.address, WETH9_MAINNET, DEPOSIT_AMOUNT)

    //   //check investorTokenCount
    //   const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
    //   //check investorTokens
    //   const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //   //check rewardTokens
    //   const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
    //   //check fund balance
    //   const fundWETHAfter = await WETH9.balanceOf(NewFundAddress)

    //   expect(investorTokenCount).to.equal(1)
    //   expect(managerWETHAfter).to.equal(managerWETHBefore.add(DEPOSIT_AMOUNT))
    //   expect(rewardTokens).to.be.empty
    //   expect(fundWETHAfter).to.equal(fundWETHBefore.add(DEPOSIT_AMOUNT))
    // })

    // it("withdraw WETH", async function () {
    //   const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
    //   const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //   const fundWETHBefore = await WETH9.balanceOf(NewFundAddress)
    //   const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)

    //   await newFundContract.connect(manager).withdraw(manager.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

    //   //check investorTokenCount
    //   const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
    //   //check investorTokens
    //   const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //   //check rewardTokens
    //   const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
    //   //check fund balance
    //   const fundWETHAfter = await WETH9.balanceOf(NewFundAddress)

    //   expect(investorTokenCount).to.equal(1)
    //   expect(managerWETHAfter).to.equal(managerWETHBefore.sub(WITHDRAW_AMOUNT))
    //   expect(rewardTokens).to.be.empty
    //   expect(fundWETHAfter).to.equal(fundWETHBefore.sub(WITHDRAW_AMOUNT))
    // })


    // describe('swap', () => {

    //   describe("#exactInputSingle", async function () {

    //     async function exactInputSingle(
    //       tokenIn: string,
    //       tokenOut: string,
    //       amountIn: BigNumber,
    //       amountOutMinimum: BigNumber,
    //       sqrtPriceLimitX96: BigNumber
    //     ): Promise<ContractTransaction> {

    //       const value = 0

    //       const params: V3TradeParams[] = [
    //         {
    //           tradeType: V3TradeType.EXACT_INPUT,
    //           swapType: V3SwapType.SINGLE_HOP,
    //           investor: manager.address,
    //           tokenIn: tokenIn,
    //           tokenOut: tokenOut,
    //           recipient: NewFundAddress,
    //           fee: FeeAmount.MEDIUM,
    //           amountIn,
    //           amountOut: BigNumber.from(0),
    //           amountInMaximum: BigNumber.from(0),
    //           amountOutMinimum,
    //           sqrtPriceLimitX96: sqrtPriceLimitX96 ?? BigNumber.from(0),
    //           path: '0x1234'
    //         }
    //       ]

    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
    //       return newFundContract.connect(manager).swap(params, { value })
    //     }

    //     it("WETH -> UNI", async function () {
    //       const swapInputAmount = BigNumber.from(1000000)
    //       const amountOutMinimum = BigNumber.from(1)
    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //       const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       await exactInputSingle(
    //         WETH9_MAINNET, 
    //         UNI_ADDRESS, 
    //         swapInputAmount, 
    //         amountOutMinimum, 
    //         BigNumber.from(0)
    //       )

    //       const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       expect(managerWETHAfter).to.equal(managerWETHBefore.sub(swapInputAmount))
    //       expect(managerUNIAfter).to.be.above(managerUNIBefore)
    //     })

    //     it("UNI -> WETH", async function () {
    //       const swapInputAmount = BigNumber.from(1000000)
    //       const amountOutMinimum = BigNumber.from(1)

    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //       const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       await exactInputSingle(
    //         UNI_ADDRESS,
    //         WETH9_MAINNET, 
    //         swapInputAmount, 
    //         amountOutMinimum, 
    //         BigNumber.from(0)
    //       )

    //       const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       expect(managerWETHAfter).to.be.above(managerWETHBefore)
    //       expect(managerUNIAfter).to.equal(managerUNIBefore.sub(swapInputAmount))

    //     })

    //   })

    //   describe("#exactOutputSingle", async function () {

    //     async function exactOutputSingle(
    //       tokenIn: string,
    //       tokenOut: string,
    //       amountOut: BigNumber,
    //       amountInMaximum: BigNumber,
    //       sqrtPriceLimitX96: BigNumber
    //     ): Promise<ContractTransaction> {

    //       const value = 0

    //       const params: V3TradeParams[] = [
    //         {
    //           tradeType: V3TradeType.EXACT_OUTPUT,
    //           swapType: V3SwapType.SINGLE_HOP,
    //           investor: manager.address,
    //           tokenIn: tokenIn,
    //           tokenOut: tokenOut,
    //           recipient: NewFundAddress,
    //           fee: FeeAmount.MEDIUM,
    //           amountIn: BigNumber.from(0),
    //           amountOut,
    //           amountInMaximum,
    //           amountOutMinimum: BigNumber.from(0),
    //           sqrtPriceLimitX96: sqrtPriceLimitX96 ?? BigNumber.from(0),
    //           path: '0x1234'
    //         }
    //       ]
          
    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
    //       return newFundContract.connect(manager).swap(params, { value })
    //     }

    //     it("WETH -> UNI", async function () {
    //       const swapOutputAmount = BigNumber.from(1000000)
    //       const amountInMaximum = BigNumber.from(100000)
    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //       const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       await exactOutputSingle(
    //         WETH9_MAINNET, 
    //         UNI_ADDRESS, 
    //         swapOutputAmount, 
    //         amountInMaximum, 
    //         BigNumber.from(0)
    //       )

    //       const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       expect(managerWETHAfter).to.be.below(managerWETHBefore)
    //       expect(managerUNIAfter).to.equal(managerUNIBefore.add(swapOutputAmount))
    //     })

    //     it("UNI -> WETH", async function () {
    //       const swapOutputAmount = BigNumber.from(100000)
    //       const amountInMaximum = BigNumber.from(30000000)
    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //       const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       await exactOutputSingle(
    //         UNI_ADDRESS,
    //         WETH9_MAINNET, 
    //         swapOutputAmount, 
    //         amountInMaximum, 
    //         BigNumber.from(0)
    //       )

    //       const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       expect(managerWETHAfter).to.equal(managerWETHBefore.add(swapOutputAmount))
    //       expect(managerUNIAfter).to.be.below(managerUNIBefore)
    //     })

    //   })

    //   describe("#exactInput", async function () {

    //     async function exactInput(
    //       tokens: string[],
    //       amountIn: BigNumber,
    //       amountOutMinimum: BigNumber
    //     ): Promise<ContractTransaction> {

    //       const value = 0
    //       const path = encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))

    //       const params: V3TradeParams[] = [
    //         {
    //           tradeType: V3TradeType.EXACT_INPUT,
    //           swapType: V3SwapType.MULTI_HOP,
    //           investor: manager.address,
    //           tokenIn: NULL_ADDRESS,
    //           tokenOut: NULL_ADDRESS,
    //           recipient: NewFundAddress,
    //           fee: 0,
    //           amountIn,
    //           amountOut: BigNumber.from(0),
    //           amountInMaximum: BigNumber.from(0),
    //           amountOutMinimum,
    //           sqrtPriceLimitX96: BigNumber.from(0),
    //           path: path
    //         }
    //       ]

    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
    //       return newFundContract.connect(manager).swap(params, { value })
    //     }

    //     it("WETH -> DAI -> UNI", async function () {
    //       const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
    //       const swapInputAmount = BigNumber.from(10000)
    //       const amountOutMinimum = BigNumber.from(1)
    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //       const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       await exactInput(
    //         tokens,
    //         swapInputAmount,
    //         amountOutMinimum
    //       )

    //       const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       expect(managerWETHAfter).to.equal(managerWETHBefore.sub(swapInputAmount))
    //       expect(managerUNIAfter).to.be.above(managerUNIBefore)
    //     })

    //     it("UNI -> DAI -> WETH", async function () {
    //       const tokens = [UNI_ADDRESS, DAI_ADDRESS, WETH9_MAINNET]
    //       const swapInputAmount = BigNumber.from(3000000)
    //       const amountOutMinimum = BigNumber.from(1)

    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //       const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       await exactInput(
    //         tokens,
    //         swapInputAmount,
    //         amountOutMinimum
    //       )

    //       const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       expect(managerWETHAfter).to.be.above(managerWETHBefore)
    //       expect(managerUNIAfter).to.equal(managerUNIBefore.sub(swapInputAmount))
    //     })

    //   })

    //   describe("#exactOutput", async function () {

    //     async function exactOutput(
    //       tokens: string[],
    //       amountOut: BigNumber,
    //       amountInMaximum: BigNumber
    //     ): Promise<ContractTransaction> {

    //       const value = 0
    //       const path = encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
    //       const params: V3TradeParams[] = [
    //         {
    //           tradeType: V3TradeType.EXACT_OUTPUT,
    //           swapType: V3SwapType.MULTI_HOP,
    //           investor: manager.address,
    //           tokenIn: NULL_ADDRESS,
    //           tokenOut: NULL_ADDRESS,
    //           recipient: NewFundAddress,
    //           fee: 0,
    //           amountIn: BigNumber.from(0),
    //           amountOut,
    //           amountInMaximum,
    //           amountOutMinimum: BigNumber.from(0),
    //           sqrtPriceLimitX96: BigNumber.from(0),
    //           path: path
    //         }
    //       ]

    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
    //       return newFundContract.connect(manager).swap(params, { value })
    //     }


    //     it("WETH -> DAI -> UNI", async function () {
    //       const tokens = [WETH9_MAINNET, DAI_ADDRESS, UNI_ADDRESS]
    //       const swapOutputAmount = BigNumber.from(1000000)
    //       const amountInMaximum = BigNumber.from(100000)
    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //       const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       await exactOutput(
    //         tokens,
    //         swapOutputAmount,
    //         amountInMaximum
    //       )

    //       const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       expect(managerWETHAfter).to.be.below(managerWETHBefore)
    //       expect(managerUNIAfter).to.equal(managerUNIBefore.add(swapOutputAmount))
    //     })

    //     it("UNI -> DAI -> WETH", async function () {
    //       const tokens = [UNI_ADDRESS, DAI_ADDRESS, WETH9_MAINNET]
    //       const swapOutputAmount = BigNumber.from(10000)
    //       const amountInMaximum = BigNumber.from(3000000)

    //       const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)

    //       const managerWETHBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIBefore = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       await exactOutput(
    //         tokens,
    //         swapOutputAmount,
    //         amountInMaximum
    //       )

    //       const managerWETHAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, WETH9_MAINNET)
    //       const managerUNIAfter = await newFundContract.connect(manager).getInvestorTokenAmount(manager.address, UNI_ADDRESS)

    //       expect(managerWETHAfter).to.equal(managerWETHBefore.add(swapOutputAmount))
    //       expect(managerUNIAfter).to.be.below(managerUNIBefore)

    //     })

    //   })








    // it("withdraw ETH ( MANAGER_FEE 1% )", async function () {
    //   const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
    //   const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

    //   const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
    //   await newFundContract.connect(investor).withdraw(investor.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

    //   const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
    //   const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

    //   const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
    //   expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.sub(investorWithdrawAmount))
    // })

    // it("deposit WETH", async function () {
    //   const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
    //   const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

    //   await WETH9.connect(investor).approve(NewFundAddress, constants.MaxUint256)
    //   const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
    //   await newFundContract.connect(investor).deposit(investor.address, WETH9_MAINNET, DEPOSIT_AMOUNT)

    //   const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
    //   expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.add(DEPOSIT_AMOUNT))
    // })

    // it("withdraw WETH ( MANAGER_FEE 1% )", async function () {
    //   const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
    //   const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
    //   const beforeManagerWETHBalance = await WETH9.balanceOf(investor.address)

    //   const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
    //   await newFundContract.connect(investor).withdraw(investor.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

    //   const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
    //   const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

    //   const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
    //   expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.sub(investorWithdrawAmount))
    // })

  })

  // describe('sender : not investor', () => {

  //   let deployer: Wallet, manager: Wallet, notInvestor: Wallet

  //   let FactoryContractAddress = ''
  //   let FundContractAddress = ''
  //   let NewFundAddress = ''

  //   let fundBytecode = ''

  //   before('get signer', async () => {
  //     [deployer, manager, notInvestor] = await (ethers as any).getSigners()
  //   })
  //   before('load fund bytecode', async () => {
  //     fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
  //   })

  //   it("Deploy XXXFactory Contract", async function () {
  //     const XXXFactory = await ethers.getContractFactory("XXXFactory")
  //     const Factory = await XXXFactory.connect(deployer).deploy()
  //     await Factory.deployed()
  //     FactoryContractAddress = Factory.address
  //   })

  //   it("Deploy XXXFund2 Contract", async function () {
  //     const XXXFund = await ethers.getContractFactory("XXXFund2")
  //     const Fund = await XXXFund.connect(deployer).deploy()
  //     await Fund.deployed()
  //     FundContractAddress = Fund.address
  //   })

  //   it("createFund()", async function () {
  //     const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //     await FactoryContract.connect(manager).createFund(manager.address)
  //     const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
  //     const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
  //     expect(savedFundAddress).to.equal(expectedFundAddress)
  //     NewFundAddress = expectedFundAddress
  //   })

  //   it("ETH -> WETH", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeWETHBalance = await WETH9.balanceOf(notInvestor.address)
  //     await WETH9.connect(notInvestor).deposit({
  //               from: notInvestor.address,
  //               value: WETH_CHARGE_AMOUNT
  //           })
  //     const afterWETHBalance = await WETH9.balanceOf(notInvestor.address)
  //     expect(afterWETHBalance).to.equal(beforeWETHBalance.add(WETH_CHARGE_AMOUNT))
  //   })

  //   it("deposit ETH => receive()", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     await expect(notInvestor.sendTransaction({
  //       to: NewFundAddress,
  //       value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
  //     })).to.be.revertedWith('receive() => account is not exist in manager list nor investor list')
  //   })

  //   it("withdraw ETH ( MANAGER_FEE 1% )", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

  //     const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
  //     await expect(newFundContract.connect(notInvestor)
  //       .withdraw(notInvestor.address, WETH9_MAINNET, WITHDRAW_AMOUNT))
  //       .to.be.revertedWith('withdraw() => account is not exist in manager list nor investor list')
  //   })

  //   it("deposit WETH", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

  //     await WETH9.connect(notInvestor).approve(NewFundAddress, constants.MaxUint256)
  //     const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
  //     await expect(newFundContract.connect(notInvestor).deposit(notInvestor.address, WETH9_MAINNET, DEPOSIT_AMOUNT))
  //       .to.be.revertedWith('deposit() => account is not exist in manager list nor investor list')
  //   })

  //   it("withdraw WETH ( MANAGER_FEE 1% )", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     const beforeManagerWETHBalance = await WETH9.balanceOf(notInvestor.address)

  //     const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
  //     await expect(newFundContract.connect(notInvestor).withdraw(notInvestor.address, WETH9_MAINNET, WITHDRAW_AMOUNT))
  //       .to.be.revertedWith('withdraw() => account is not exist in manager list nor investor list')
  //   })

  // })


  describe('sender : manager investor', () => {

  })

  describe('sender : manager manager', () => {

  })
})