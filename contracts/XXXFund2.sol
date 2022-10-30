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

    address public factory;
    address public override manager;

    // investor tokens
    mapping(address => Token[]) public investorTokens;
    //manager fee tokens
    Token[] public feeTokens;
    
    //position deposit
    /// deposits[tokenId] => pDeposit
    mapping(uint256 => pDeposit) public deposits;
    /// @dev positions[investor] => [ tokenId0, tokenId1, ... ]
    mapping(address => uint256[]) public positions;

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
            emit Deposit(address(this), manager, msg.sender, WETH9, msg.value);
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

    function getPositionTokenIds(address investor) external override view returns (uint256[] memory tokenIds) {
        uint256[] memory tokenIds = positions[investor];
        return tokenIds;
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
        emit ManagerFeeIn(address(this), investor, manager, _token, _amount);
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
        emit ManagerFeeOut(address(this), manager, _token, _amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'ANE');
        require(IXXXFactory(factory).isWhiteListToken(_token), 'NWT');

        IERC20(_token).transferFrom(msg.sender, address(this), _amount);

        increaseToken(investorTokens[msg.sender], _token, _amount);
        emit Deposit(address(this), manager, msg.sender, _token, _amount);
    }

    function withdraw(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed, 'US');
        uint256 managerFee = IXXXFactory(factory).getManagerFee();
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
        emit Withdraw(address(this), manager, msg.sender, _token, withdrawAmount, feeAmount);
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
        emit Swap(
            address(this),
            manager,
            investor,
            swapFrom,
            swapTo,
            swapFromAmount,
            swapToAmount
        );
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
        address swapRouter = IXXXFactory(factory).getSwapRouterAddress();

        for(uint256 i=0; i<trades.length; i++) {

            if (trades[i].swapType == SwapType.EXACT_INPUT_SINGLE_HOP) 
            {
                require(IXXXFactory(factory).isWhiteListToken(trades[i].tokenOut), 'NWT');

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
                require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
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
                require(IXXXFactory(factory).isWhiteListToken(trades[i].tokenOut), 'NWT');

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
                // If the actual amount spent (amountIn) is less than the specified maximum amount, we approve the swapRouter to spend 0.
                if (amountIn < trades[i].amountInMaximum) {
                    IERC20Minimal(trades[i].tokenIn).approve(swapRouter, 0);
                }

                handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, amountIn, trades[i].amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_OUTPUT_MULTI_HOP) 
            {
                address tokenIn = getLastTokenFromPath(trades[i].path);
                (address tokenOut, , ) = trades[i].path.decodeFirstPool();
                require(IXXXFactory(factory).isWhiteListToken(tokenOut), 'NWT');

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

    function getPositionInfo(address nonfungiblePositionManager, uint256 tokenId) private returns (address token0, address token1, uint128 liquidity) {
        (, , address token0, address token1, , , , uint128 liquidity, , , , ) =
            INonfungiblePositionManager(nonfungiblePositionManager).positions(tokenId);
    }

    function mintNewPosition(MintPositionParams calldata _params)
        external
        override
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        // // Approve the position manager
        IERC20Minimal(_params.token0).approve(nonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(nonfungiblePositionManager, _params.amount1Desired);

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

        // Note that the pool defined by DAI/USDC and fee tier 0.3% must already be created and initialized in order to mint
        (tokenId, liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).mint(params);

        decreaseToken(investorTokens[_params.investor], _params.token0, amount0);
        decreaseToken(investorTokens[_params.investor], _params.token1, amount1);

        (address token0, address token1, uint128 liquidity) = getPositionInfo(nonfungiblePositionManager, tokenId);
        // set the owner and data for position
        // operator is investor
        deposits[tokenId] = pDeposit({owner: _params.investor, liquidity: liquidity, token0: token0, token1: token1});
        positions[_params.investor].push(tokenId);
    }

    function collectAllFees(CollectFeeParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        INonfungiblePositionManager.CollectParams memory params =
            INonfungiblePositionManager.CollectParams({
                tokenId: _params.tokenId,
                recipient: address(this),
                amount0Max: _params.amount0Max,
                amount1Max: _params.amount1Max
            });
        // Caller must own the ERC721 position, meaning it must be a deposit
        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).collect(params);

        increaseToken(investorTokens[_params.investor], deposits[_params.tokenId].token0, amount0);
        increaseToken(investorTokens[_params.investor], deposits[_params.tokenId].token1, amount1);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        // caller must be the owner of the NFT
        require(msg.sender == deposits[_params.tokenId].owner || msg.sender == manager, 'NO');

        INonfungiblePositionManager.DecreaseLiquidityParams memory params =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: _params.tokenId,
                liquidity: _params.liquidity,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });

        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).decreaseLiquidity(params);

        increaseToken(investorTokens[_params.investor], deposits[_params.tokenId].token0, amount0);
        increaseToken(investorTokens[_params.investor], deposits[_params.tokenId].token1, amount1);
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata _params) 
        external override returns (uint128 liquidity, uint256 amount0, uint256 amount1) 
    {
        IERC20Minimal(deposits[_params.tokenId].token0).approve(nonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(deposits[_params.tokenId].token1).approve(nonfungiblePositionManager, _params.amount1Desired);

        INonfungiblePositionManager.IncreaseLiquidityParams memory params =
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: _params.tokenId,
                amount0Desired: _params.amount0Desired,
                amount1Desired: _params.amount1Desired,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });

        (liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).increaseLiquidity(params);

        decreaseToken(investorTokens[_params.investor], deposits[_params.tokenId].token0, amount0);
        decreaseToken(investorTokens[_params.investor], deposits[_params.tokenId].token1, amount1);
    }
}