// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/Path.sol';

import './interfaces/IXXXFund2.sol';
import './interfaces/IXXXFactory.sol';
import './base/Constants.sol';
import './base/Payments.sol';
import './base/Token.sol';
import './libraries/PriceOracle.sol';
import './libraries/SwapManager.sol';
import './libraries/LiquidityManager.sol';

//TODO : remove console
import "hardhat/console.sol";

contract XXXFund2 is 
    IXXXFund2,
    Constants,
    Payments,
    Token
{
    using Path for bytes;

    address public factory;
    address public override manager;

    // manager tokens and all investors tokens in fund
    Token[] public fundTokens;
    Token[] public feeTokens; //manager fee tokens
    mapping(address => Token[]) public investorTokens;
    
    /// @dev deposits[tokenId] => pDeposit
    mapping(uint256 => pDeposit) public deposits;

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {
        factory = msg.sender;
    }

    receive() external payable {
        if (msg.sender == WETH9) {
            // when call IWETH9(WETH9).withdraw(amount) in this contract, go into here.
        } else {
            bool isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
            require(isSubscribed, 'US');
            IWETH9(WETH9).deposit{value: msg.value}();
            increaseToken(investorTokens[msg.sender], WETH9, msg.value);
            increaseToken(fundTokens, WETH9, msg.value);
            uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, WETH9, uint128(msg.value), WETH9);
            emit Deposit(address(this), manager, msg.sender, WETH9, msg.value, amountETH);
        }
    }

    function initialize(address _manager) override external {
        require(msg.sender == factory, 'FORBIDDEN'); // sufficient check
        manager = _manager;
        emit Initialize(address(this), _manager);
    }

    function getFundTokens() external override view returns (Token[] memory) {
        return getTokens(fundTokens);
    }

    function getFeeTokens() external override view returns (Token[] memory) {
        return getTokens(feeTokens);
    }

    function getInvestorTokens(address investor) external override view returns (Token[] memory) {
        return getTokens(investorTokens[investor]);
    }

    function getInvestorTokenAmount(address investor, address token) public override view returns (uint256) {
        return getTokenAmount(investorTokens[investor], token);
    }

    function isTokenEnough(Token[] memory tokens, address _token, uint256 _amount) private view returns (bool) {
        bool isEnough = false;
        uint256 tokenAmount = getTokenAmount(tokens, _token);
        require(tokenAmount >= _amount, 'NET');
        isEnough = true;
        return isEnough;
    }

    function feeIn(address investor, address _token, uint256 _amount) private {
        bool isNewToken = true;
        for (uint256 i=0; i<feeTokens.length; i++) {
            if (feeTokens[i].tokenAddress == _token) {
                isNewToken = false;
                feeTokens[i].amount += _amount;
                break;
            }
        }
        if (isNewToken) {
            feeTokens.push(Token(_token, _amount));
        }
        uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, uint128(_amount), WETH9);
        emit ManagerFeeIn(address(this), investor, manager, _token, _amount, amountETH);
    }

    function feeOut(address _token, uint256 _amount) external payable override lock {
        require(msg.sender == manager, 'NM');
        bool isNewToken = true;
        for (uint256 i=0; i<feeTokens.length; i++) {
            if (feeTokens[i].tokenAddress == _token) {
                isNewToken = false;
                require(feeTokens[i].amount >= _amount, 'TNE');
                _withdraw(_token, _amount);
                feeTokens[i].amount -= _amount;
                break;
            }
        }
        require(isNewToken == false, 'TNE');
        decreaseToken(fundTokens, _token, _amount);
        uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, uint128(_amount), WETH9);
        emit ManagerFeeOut(address(this), manager, _token, _amount, amountETH);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'ANE');
        require(IXXXFactory(factory).isWhiteListToken(_token), 'NWT');

        IERC20(_token).transferFrom(msg.sender, address(this), _amount);

        increaseToken(investorTokens[msg.sender], _token, _amount);
        increaseToken(fundTokens, _token, _amount);
        uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, uint128(_amount), WETH9);
        emit Deposit(address(this), manager, msg.sender, _token, _amount, amountETH);
    }

    function withdraw(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed, 'US');
        uint256 managerFee = IXXXFactory(factory).getManagerFee();
        require(isTokenEnough(investorTokens[msg.sender], _token, _amount), 'NET');

        uint256 feeAmount = 0;
        uint256 withdrawAmount = 0;
        if (msg.sender == manager) {
            // manager withdraw is no need manager fee
            feeAmount = 0;
            withdrawAmount = _amount;
            _withdraw(_token, _amount);
        } else {
            // send manager fee.
            feeAmount = _amount * managerFee / 100;
            withdrawAmount = _amount - feeAmount;
            _withdraw(_token, withdrawAmount);
            feeIn(msg.sender, _token, feeAmount);
        }
        decreaseToken(investorTokens[msg.sender], _token, _amount);
        decreaseToken(fundTokens, _token, withdrawAmount);
        uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, uint128(_amount), WETH9);
        emit Withdraw(address(this), manager, msg.sender, _token, withdrawAmount, feeAmount, amountETH);
    }

    function handleSwap(
        address investor, 
        address swapFrom, 
        address swapTo, 
        uint256 swapFromAmount, 
        uint256 swapToAmount
    ) private {
        //update info
        decreaseToken(investorTokens[investor], swapFrom, swapFromAmount);
        increaseToken(investorTokens[investor], swapTo, swapToAmount);
        decreaseToken(fundTokens, swapFrom, swapFromAmount);
        increaseToken(fundTokens, swapTo, swapToAmount);
        uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, swapTo, uint128(swapToAmount), WETH9);
        emit Swap(
            address(this),
            manager,
            investor,
            swapFrom,
            swapTo,
            swapFromAmount,
            swapToAmount,
            amountETH
        );
    }

    function swap(SwapParams[] calldata trades) external payable override lock {
        require(msg.sender == manager, 'NM');
        address swapRouter = IXXXFactory(factory).getSwapRouterAddress();

        for(uint256 i=0; i<trades.length; i++) {

            if (trades[i].swapType == SwapType.EXACT_INPUT_SINGLE_HOP) 
            {
                require(IXXXFactory(factory).isWhiteListToken(trades[i].tokenOut), 'NWT');

                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(tokenBalance >= trades[i].amountIn, 'TMIA');

                uint256 amountOut = SwapManager.exactInputSingle(
                    factory,
                    swapRouter,
                    trades[i].tokenIn,
                    trades[i].tokenOut,
                    trades[i].fee,
                    trades[i].amountIn,
                    trades[i].amountOutMinimum
                );
                handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, trades[i].amountIn, amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_INPUT_MULTI_HOP) 
            {
                address tokenOut = SwapManager.getLastTokenFromPath(trades[i].path);
                (address tokenIn, , ) = trades[i].path.decodeFirstPool();
                require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
                    'NWT');

                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, tokenIn);
                require(tokenBalance >= trades[i].amountIn, 'TMIA');

                uint256 amountOut = SwapManager.exactInput(
                    factory,
                    swapRouter,
                    trades[i].path,
                    trades[i].amountIn,
                    trades[i].amountOutMinimum,
                    tokenIn
                );
                handleSwap(trades[i].investor, tokenIn, tokenOut, trades[i].amountIn, amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_OUTPUT_SINGLE_HOP) 
            {
                require(IXXXFactory(factory).isWhiteListToken(trades[i].tokenOut), 'NWT');

                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(tokenBalance >= trades[i].amountIn, 'TMIA');

                uint256 amountIn = SwapManager.exactOutputSingle(
                    factory,
                    swapRouter,
                    trades[i].tokenIn,
                    trades[i].tokenOut,
                    trades[i].fee,
                    trades[i].amountOut,
                    trades[i].amountInMaximum
                );
                handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, amountIn, trades[i].amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_OUTPUT_MULTI_HOP) 
            {
                address tokenIn = SwapManager.getLastTokenFromPath(trades[i].path);
                (address tokenOut, , ) = trades[i].path.decodeFirstPool();
                require(IXXXFactory(factory).isWhiteListToken(tokenOut), 'NWT');

                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, tokenIn);
                require(tokenBalance >= trades[i].amountInMaximum, 'TMIA');

                uint256 amountIn = SwapManager.exactOutput(
                    factory,
                    swapRouter,
                    trades[i].path,
                    trades[i].amountOut,
                    trades[i].amountInMaximum,
                    tokenIn
                );
                handleSwap(trades[i].investor, tokenIn, tokenOut, amountIn, trades[i].amountOut);
            }
        }
    }

    function mintNewPosition(MintLiquidityParams calldata params)
        external
        override
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        // Approve the position manager
        IERC20Minimal(params.token0).approve(nonfungiblePositionManager, params.amount0Desired);
        IERC20Minimal(params.token1).approve(nonfungiblePositionManager, params.amount1Desired);

        (tokenId, liquidity, amount0, amount1) = LiquidityManager.mintNewPosition(
            nonfungiblePositionManager,
            params.token0,
            params.token1,
            params.fee,
            params.tickLower,
            params.tickUpper,
            params.amount0Desired,
            params.amount1Desired,
            params.amount0Min,
            params.amount1Min
        );
        decreaseToken(investorTokens[params.investor], params.token0, amount0);
        decreaseToken(investorTokens[params.investor], params.token1, amount1);
        decreaseToken(fundTokens, params.token0, amount0);
        decreaseToken(fundTokens, params.token1, amount1);

        (address token0, address token1, uint128 liquidity) = LiquidityManager.getPositions(nonfungiblePositionManager, tokenId);
        // set the owner and data for position
        // operator is investor
        deposits[tokenId] = pDeposit({owner: params.investor, liquidity: liquidity, token0: token0, token1: token1});
    }

    function collectAllFees(CollectLiquidityParams calldata params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        (amount0, amount1) = LiquidityManager.collectAllFees(
            nonfungiblePositionManager,
            params.tokenId,
            params.amount0Max,
            params.amount1Max
        );
        increaseToken(investorTokens[params.investor], deposits[params.tokenId].token0, amount0);
        increaseToken(investorTokens[params.investor], deposits[params.tokenId].token1, amount1);
        increaseToken(fundTokens, deposits[params.tokenId].token0, amount0);
        increaseToken(fundTokens, deposits[params.tokenId].token1, amount1);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        // caller must be the owner of the NFT
        require(msg.sender == deposits[params.tokenId].owner || msg.sender == manager, 'NO');

        (amount0, amount1) = LiquidityManager.decreaseLiquidity(
            nonfungiblePositionManager,
            params.tokenId,
            params.liquidity,
            params.amount0Min,
            params.amount1Min
        );
        increaseToken(investorTokens[params.investor], deposits[params.tokenId].token0, amount0);
        increaseToken(investorTokens[params.investor], deposits[params.tokenId].token1, amount1);
        increaseToken(fundTokens, deposits[params.tokenId].token0, amount0);
        increaseToken(fundTokens, deposits[params.tokenId].token1, amount1);
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata params) 
        external override returns (uint128 liquidity, uint256 amount0, uint256 amount1) 
    {
        IERC20Minimal(deposits[params.tokenId].token0).approve(nonfungiblePositionManager, params.amount0Desired);
        IERC20Minimal(deposits[params.tokenId].token1).approve(nonfungiblePositionManager, params.amount1Desired);

        (liquidity, amount0, amount1) = LiquidityManager.increaseLiquidity(
            nonfungiblePositionManager,
            params.tokenId,
            params.amount0Desired,
            params.amount1Desired,
            params.amount0Min,
            params.amount1Min
        );
        decreaseToken(investorTokens[params.investor], deposits[params.tokenId].token0, amount0);
        decreaseToken(investorTokens[params.investor], deposits[params.tokenId].token1, amount1);
        decreaseToken(fundTokens, deposits[params.tokenId].token0, amount0);
        decreaseToken(fundTokens, deposits[params.tokenId].token1, amount1);
    }

    function getInvestorTotalValueLockedETH(address investor) external override view returns (uint256) {
        uint256 tvlETH = 0;
        for (uint256 i=0; i<investorTokens[investor].length; i++) {
            address tokenAddress = investorTokens[investor][i].tokenAddress;
            uint256 amount = investorTokens[investor][i].amount;
            tvlETH += PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, tokenAddress, uint128(amount), WETH9);
        }
        return tvlETH;
    }

    function getManagerFeeTotalValueLockedETH() external override view returns (uint256) {
        uint256 tvlETH = 0;
        for (uint256 i=0; i<feeTokens.length; i++) {
            address tokenAddress = feeTokens[i].tokenAddress;
            uint256 amount = feeTokens[i].amount;
            tvlETH += PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, tokenAddress, uint128(amount), WETH9);
        }
        return tvlETH;
    }

    function getETHPriceInUSD() external override view returns (uint256) {
        return PriceOracle.getETHPriceInUSD(UNISWAP_V3_FACTORY, WETH9, USDC);
    }
}