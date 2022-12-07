// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';
import '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';

import './interfaces/IXXXFund2.sol';
import './interfaces/IXXXFactory.sol';
import './base/Constants.sol';
import './base/Payments.sol';
import './base/Token.sol';

//TODO : remove console
import "hardhat/console.sol";

contract XXXFund2 is 
    IXXXFund2,
    Constants,
    Payments,
    Token
{
    using Path for bytes;

    // position
    struct Position {
        address owner;
        uint128 liquidity;
        address token0;
        address token1;
    }

    address public factory;
    address public override manager;

    // investor's tokens which is not deposited to uniswap v3 liquidity position
    mapping(address => Token[]) public investorTokens;
    // investor's tokens which is deposited to uniswap v3 liquidity position
    mapping(uint256 => Position) public positions;
    // tokenIds[investor] => [ tokenId0, tokenId1, ... ]
    mapping(address => uint256[]) public tokenIds;
    // manager fee tokens
    Token[] public feeTokens;

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
            emit Deposit(msg.sender, WETH9, msg.value);
        }
    }

    function initialize(address _manager) override external {
        require(msg.sender == factory, 'FORBIDDEN'); // sufficient check
        manager = _manager;
        emit Initialize(address(this), _manager);
    }

    function getInvestorTokens(address investor) external override view returns (Token[] memory) {
        return getTokens(investorTokens[investor]);
    }

    function getFeeTokens() external override view returns (Token[] memory) {
        return getTokens(feeTokens);
    }

    function getInvestorTokenAmount(address investor, address token) public override view returns (uint256) {
        return getTokenAmount(investorTokens[investor], token);
    }

    function getPositionTokenIds(address investor) external override view returns (uint256[] memory _tokenIds) {
        uint256[] memory _tokenIds = tokenIds[investor];
        return _tokenIds;
    }

    function feeIn(address investor, address token, uint256 amount) private {
        increaseToken(feeTokens, token, amount);
        emit ManagerFeeIn(investor, token, amount);
    }

    function feeOut(address token, uint256 amount) external payable override lock {
        require(msg.sender == manager, 'NM');

        bool isSuccess = decreaseToken(feeTokens, token, amount);
        if (isSuccess) {
            _withdraw(token, amount);
        }
        emit ManagerFeeOut(token, amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'ANE');
        require(IXXXFactory(factory).whiteListTokens(_token), 'NWT');

        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        increaseToken(investorTokens[msg.sender], _token, _amount);
        emit Deposit(msg.sender, _token, _amount);
    }

    function withdraw(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed, 'US');
        uint256 managerFee = IXXXFactory(factory).managerFee();
        uint256 tokenAmount = getTokenAmount(investorTokens[msg.sender], _token);
        require(tokenAmount >= _amount, 'NET');

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
        emit Withdraw(msg.sender, _token, withdrawAmount, feeAmount);
    }

    function handleSwap(
        address investor, 
        address swapFrom, 
        address swapTo, 
        uint256 swapFromAmount, 
        uint256 swapToAmount
    ) private {
        decreaseToken(investorTokens[investor], swapFrom, swapFromAmount);
        increaseToken(investorTokens[investor], swapTo, swapToAmount);
        emit Swap(investor, swapFrom, swapTo, swapFromAmount, swapToAmount);
    }

    function getLastTokenFromPath(bytes memory path) internal view returns (address) {
        address _tokenOut;

        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            if (hasMultiplePools) {
                path = path.skipToken();
            } else {
                (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
                _tokenOut = tokenOut;
                break;
            }
        }
        return _tokenOut;
    }

    function swap(SwapParams[] calldata trades) external payable override lock {
        require(msg.sender == manager, 'NM');
        address swapRouter = SwapRouterAddress;

        for(uint256 i=0; i<trades.length; i++) {

            if (trades[i].swapType == SwapType.EXACT_INPUT_SINGLE_HOP) 
            {
                require(IXXXFactory(factory).whiteListTokens(trades[i].tokenOut), 'NWT');

                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(tokenBalance >= trades[i].amountIn, 'TMIA');

                // approve
                IERC20Minimal(trades[i].tokenIn).approve(swapRouter, trades[i].amountIn);

                ISwapRouter02.ExactInputSingleParams memory params =
                    IV3SwapRouter.ExactInputSingleParams({
                        tokenIn: trades[i].tokenIn,
                        tokenOut: trades[i].tokenOut,
                        fee: trades[i].fee,
                        recipient: address(this),
                        amountIn: trades[i].amountIn,
                        amountOutMinimum: trades[i].amountOutMinimum,
                        sqrtPriceLimitX96: 0
                    });
                uint256 amountOut = ISwapRouter02(swapRouter).exactInputSingle(params);
                
                handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, trades[i].amountIn, amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_INPUT_MULTI_HOP) 
            {
                address tokenOut = getLastTokenFromPath(trades[i].path);
                (address tokenIn, , ) = trades[i].path.decodeFirstPool();
                require(IXXXFactory(factory).whiteListTokens(tokenOut), 
                    'NWT');

                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, tokenIn);
                require(tokenBalance >= trades[i].amountIn, 'TMIA');

                // approve
                IERC20Minimal(tokenIn).approve(swapRouter, trades[i].amountIn);

                ISwapRouter02.ExactInputParams memory params =
                    IV3SwapRouter.ExactInputParams({
                        path: trades[i].path,
                        recipient: address(this),
                        amountIn: trades[i].amountIn,
                        amountOutMinimum: trades[i].amountOutMinimum
                    });
                uint256 amountOut = ISwapRouter02(swapRouter).exactInput(params);

                handleSwap(trades[i].investor, tokenIn, tokenOut, trades[i].amountIn, amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_OUTPUT_SINGLE_HOP) 
            {
                require(IXXXFactory(factory).whiteListTokens(trades[i].tokenOut), 'NWT');

                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(tokenBalance >= trades[i].amountIn, 'TMIA');

                // approve
                IERC20Minimal(trades[i].tokenIn).approve(swapRouter, trades[i].amountInMaximum);

                ISwapRouter02.ExactOutputSingleParams memory params =
                    IV3SwapRouter.ExactOutputSingleParams({
                        tokenIn: trades[i].tokenIn,
                        tokenOut: trades[i].tokenOut,
                        fee: trades[i].fee,
                        recipient: address(this),
                        amountOut: trades[i].amountOut,
                        amountInMaximum: trades[i].amountInMaximum,
                        sqrtPriceLimitX96: 0
                    });
                uint256 amountIn = ISwapRouter02(swapRouter).exactOutputSingle(params);

                // For exact output swaps, the amountInMaximum may not have all been spent.
                if (amountIn < trades[i].amountInMaximum) {
                    IERC20Minimal(trades[i].tokenIn).approve(swapRouter, 0);
                }

                handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, amountIn, trades[i].amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_OUTPUT_MULTI_HOP) 
            {
                address tokenIn = getLastTokenFromPath(trades[i].path);
                (address tokenOut, , ) = trades[i].path.decodeFirstPool();
                require(IXXXFactory(factory).whiteListTokens(tokenOut), 'NWT');

                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, tokenIn);
                require(tokenBalance >= trades[i].amountInMaximum, 'TMIA');

                // approve
                IERC20Minimal(tokenIn).approve(swapRouter, trades[i].amountInMaximum);

                ISwapRouter02.ExactOutputParams memory params =
                    IV3SwapRouter.ExactOutputParams({
                        path: trades[i].path,
                        recipient: address(this),
                        amountOut: trades[i].amountOut,
                        amountInMaximum: trades[i].amountInMaximum
                    });
                uint256 amountIn = ISwapRouter02(swapRouter).exactOutput(params);

                // If the swap did not require the full amountInMaximum to achieve the exact amountOut then we approve the router to spend 0.
                if (amountIn < trades[i].amountInMaximum) {
                    IERC20Minimal(tokenIn).approve(swapRouter, 0);
                }

                handleSwap(trades[i].investor, tokenIn, tokenOut, amountIn, trades[i].amountOut);
            }
        }
    }

    function mintNewPosition(MintNewPositionParams calldata _params)
        external
        override
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        require(msg.sender == manager, 'NM');

        IERC20Minimal(_params.token0).approve(NonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(NonfungiblePositionManager, _params.amount1Desired);

        INonfungiblePositionManager.MintParams memory params =
            INonfungiblePositionManager.MintParams({
                token0: _params.token0,
                token1: _params.token1,
                fee: _params.fee,
                tickLower: _params.tickLower,
                tickUpper: _params.tickUpper,
                amount0Desired: _params.amount0Desired,
                amount1Desired: _params.amount1Desired,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                recipient: address(this),
                deadline: _params.deadline
            });

        (tokenId, liquidity, amount0, amount1) = INonfungiblePositionManager(NonfungiblePositionManager).mint(params);

        decreaseToken(investorTokens[_params.investor], _params.token0, amount0);
        decreaseToken(investorTokens[_params.investor], _params.token1, amount1);

        (, , address token0, address token1, , , , uint128 liquidity, , , , ) 
            = INonfungiblePositionManager(NonfungiblePositionManager).positions(tokenId);

        positions[tokenId] = Position({
            owner: _params.investor,
            liquidity: liquidity,
            token0: token0,
            token1: token1
        });
        tokenIds[_params.investor].push(tokenId);

        emit MintNewPosition(_params.investor, token0, token1, amount0, amount1);
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata _params) 
        external override returns (uint128 liquidity, uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == manager, 'NM');

        IERC20Minimal(positions[_params.tokenId].token0).approve(NonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(positions[_params.tokenId].token1).approve(NonfungiblePositionManager, _params.amount1Desired);

        INonfungiblePositionManager.IncreaseLiquidityParams memory params =
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: _params.tokenId,
                amount0Desired: _params.amount0Desired,
                amount1Desired: _params.amount1Desired,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });

        (liquidity, amount0, amount1) = INonfungiblePositionManager(NonfungiblePositionManager).increaseLiquidity(params);

        decreaseToken(investorTokens[_params.investor], positions[_params.tokenId].token0, amount0);
        decreaseToken(investorTokens[_params.investor], positions[_params.tokenId].token1, amount1);
        (, , address token0, address token1, , , , uint128 liquidity, , , , ) 
            = INonfungiblePositionManager(NonfungiblePositionManager).positions(_params.tokenId);
        positions[_params.tokenId].liquidity = liquidity;

        emit IncreaseLiquidity(_params.investor, token0, token1, amount0, amount1);
    }

    function collectPositionFee(CollectPositionFeeParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == positions[_params.tokenId].owner || msg.sender == manager, 'NO');

        INonfungiblePositionManager.CollectParams memory params =
            INonfungiblePositionManager.CollectParams({
                tokenId: _params.tokenId,
                recipient: address(this),
                amount0Max: _params.amount0Max,
                amount1Max: _params.amount1Max
            });
        (amount0, amount1) = INonfungiblePositionManager(NonfungiblePositionManager).collect(params);

        increaseToken(investorTokens[_params.investor], positions[_params.tokenId].token0, amount0);
        increaseToken(investorTokens[_params.investor], positions[_params.tokenId].token1, amount1);

        emit CollectPositionFee(_params.investor, positions[_params.tokenId].token0, positions[_params.tokenId].token1, amount0, amount1);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == positions[_params.tokenId].owner || msg.sender == manager, 'NO');

        INonfungiblePositionManager.DecreaseLiquidityParams memory params =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: _params.tokenId,
                liquidity: _params.liquidity,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });
        INonfungiblePositionManager(NonfungiblePositionManager).decreaseLiquidity(params);

        INonfungiblePositionManager.CollectParams memory collectParams =
            INonfungiblePositionManager.CollectParams({
                tokenId: _params.tokenId,
                recipient: address(this),
                amount0Max: MAX_INT,
                amount1Max: MAX_INT
            });
        (amount0, amount1) = INonfungiblePositionManager(NonfungiblePositionManager).collect(collectParams);

        increaseToken(investorTokens[_params.investor], positions[_params.tokenId].token0, amount0);
        increaseToken(investorTokens[_params.investor], positions[_params.tokenId].token1, amount1);

        (, , address token0, address token1, , , , uint128 liquidity, , , , ) 
            = INonfungiblePositionManager(NonfungiblePositionManager).positions(_params.tokenId);
        positions[_params.tokenId].liquidity = liquidity;

        emit DecreaseLiquidity(_params.investor, token0, token1, amount0, amount1);
    }
}