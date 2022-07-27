// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFund.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/IXXXFactory.sol';

import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

contract XXXFund is IXXXFund {

    address swapRouterAddress = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    uint SHARE_DECIMAL = 10 ** 6; 

// [  {  date : 2022-07-23, 
// fundAddress : 0x3939,
// fundManager : 0x9943,
// tokens : [ { address : 0xasdf, name : ETH, amount : 100, price : $1 },
// { address : 0xqwer, name : LINK, amount : 100, price : $1 } ], 
// totalValue : $200,
// type : swap,
// swapFrom :  ETH,
// swapTo : LINK,
// swapAmountOfA: 100,
// swapAmountOfB : 100 },
// {  date : 2022-10-23,
// fundAddress : 0x3939,
// fundManager : 0x9943,
// tokens : [ { tokenAddress : 0xasdf, name : ETH, amount : 200, fiatPrice : $2, etherPrice : 0.1 },
// { address : 0xqwer, name : LINK, amount : 100, fiatPrice : $1, etherPrice : 0.05 } ], 
// totalValue : $500,
// type : deposit,
// depositor : 0x6436,
// depositToken : 0xasdf,
// depositAmount : 100,
// swapFrom :  null,
// swapTo : null,
// swapAmountOfA: null,
// swapAmountOfB : null } ]


    struct ReservedToken {
        address tokenAddress;
        string tokenName;
        uint amount;
        uint fiatPrice;
        uint etherPrice;
    }

    struct SwapHistory {
        string date;
        address fundAddress;
        address fundManager;
        address swapFrom;
        address swapTo;
        string swapFromName;
        string swapToName;
        ReservedToken[] reservedTokens;
        uint totalFiatValue;
        uint totalEtherValue;
        uint turnverRatio;
        uint rateOfReturn;
    }


    address public factory;
    address public manager;
    address[] public allTokens;
    mapping(address => uint) public reservedTokens;
    address[] public holders;
    mapping(address => uint) public shares;
    SwapHistory[] public swapHistory;

    ISwapRouter public immutable swapRouter;


    event Deposit(address indexed sender, address _token, uint _amount);
    event Withdraw(address indexed sender, address _token, uint _amount);
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );


    uint private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'XXXFund: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    // Modifier to check that the caller is the manager of
    // the contract.
    modifier onlyManager() {
        require(msg.sender == manager, "Not manager");
        // Underscore is a special character only used inside
        // a function modifier and it tells Solidity to
        // execute the rest of the code.
        _;
    }


    constructor() {
        factory = msg.sender;
        swapRouter = ISwapRouter(swapRouterAddress);
    }
    
    function getFiatPrice(address token) private returns (uint fiatPrice) {
        fiatPrice = 0; 
    }

    function getTotalFiatValue() private returns (uint totalFiatValue) {
        totalFiatValue = 0;
        for (uint i = 0; i < allTokens.length; i++) {
            address token = allTokens[i];
            uint tokenFiatPrice = getFiatPrice(token);
            uint tokenAmount = reservedTokens[token];
            require(tokenFiatPrice >= 0);
            totalFiatValue += tokenFiatPrice * tokenAmount;
        }
    }

    function getReserves(address token) public view returns (uint _reserve) {
        _reserve = reservedTokens[token];
    }

    // called once by the factory at time of deployment
    function initialize(address _manager, address _token, uint256 _amount) override external {
        require(msg.sender == factory, 'XXXFund: FORBIDDEN'); // sufficient check
        require(allTokens.length == 0);
        manager = _manager;

        if (_token != address(0) && _amount > 0) {
            uint share = 1 * SHARE_DECIMAL;
            TransferHelper.safeTransferFrom(_token, manager, address(this), _amount);
            //update share[]
            shares[manager] = share;
            //update allTokens[], reservedTokens[]
            allTokens.push(_token);
            reservedTokens[_token] = _amount;
            emit Deposit(manager, _token, _amount);
        }
    }

    function getFiatAmount(address token, uint256 _amount) private returns (uint fiatAmount) {
        fiatAmount = 0; 
    }

    function getTotalFiatAmount() private returns (uint totalFiatAmount) {
        totalFiatAmount = 0; 
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address sender, address _token, uint256 _amount) override external lock {
        require(msg.sender == sender); // sufficient check

        uint depositFiatValue = getFiatAmount(_token, _amount);
        uint reservedFiatValue = getTotalFiatAmount();
        uint share = SHARE_DECIMAL * depositFiatValue / (reservedFiatValue + depositFiatValue);

        TransferHelper.safeTransfer(_token, address(this), _amount);
        //update share[]
        for (uint256 i = 0; i < holders.length; i++) {
            shares[holders[i]] = (((SHARE_DECIMAL * 1) - share) * shares[holders[i]]) / SHARE_DECIMAL;
        }
        shares[sender] += share;
        //update allTokens[], reservedTokens[]
        for (uint256 j = 0; j < allTokens.length; j++) {
            address token = allTokens[j];
            if (token == _token) {
                reservedTokens[_token] += _amount;
                emit Deposit(msg.sender, _token, _amount);
                return;
            }
        }
        allTokens.push(_token);
        reservedTokens[_token] = _amount;
        emit Deposit(msg.sender, _token, _amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function withdraw(address _token, address to, uint256 _amount) override external lock {
        require(msg.sender == to); // sufficient check
        require(reservedTokens[_token] >= _amount);
        uint withdrawableFiatAmount = shares[to] * getTotalFiatAmount() / SHARE_DECIMAL;
        uint withdrawFiatAmount = getFiatAmount(_token, _amount);
        require(withdrawableFiatAmount >= withdrawFiatAmount);

        uint reservedFiatAmount = getTotalFiatValue();
        uint share = SHARE_DECIMAL * withdrawFiatAmount / reservedFiatAmount;

        TransferHelper.safeTransferFrom(_token, address(this), to, _amount);
        //update share[]
        shares[to] -= share;
        for (uint256 i = 0; i < holders.length; i++) {
            shares[holders[i]] = ((SHARE_DECIMAL + ((SHARE_DECIMAL * share) / (SHARE_DECIMAL - share))) * shares[holders[i]]) / SHARE_DECIMAL;
        }
        //update allTokens[], reservedTokens[]
        for (uint256 j = 0; j < allTokens.length; j++) {
            address token = allTokens[j];
            if (token == _token) {
                reservedTokens[_token] -= _amount;
                emit Withdraw(to, _token, _amount);
                return;
            }
        }
    }

    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    // For this example, we will set the pool fee to 0.3%.
    uint24 public constant poolFee = 3000;

    // this low-level function should be called from a contract which performs important safety checks
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) override onlyManager external lock {

        // require(amount0Out > 0 || amount1Out > 0, 'UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT');
        // (uint112 _reserve0, uint112 _reserve1,) = getReserves(); // gas savings
        // require(amount0Out < _reserve0 && amount1Out < _reserve1, 'UniswapV2: INSUFFICIENT_LIQUIDITY');

        // uint balance0;
        // uint balance1;
        // { // scope for _token{0,1}, avoids stack too deep errors
        // address _token0 = token0;
        // address _token1 = token1;
        // require(to != _token0 && to != _token1, 'UniswapV2: INVALID_TO');
        // if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out); // optimistically transfer tokens
        // if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out); // optimistically transfer tokens
        // if (data.length > 0) IUniswapV2Callee(to).uniswapV2Call(msg.sender, amount0Out, amount1Out, data);
        // balance0 = IERC20(_token0).balanceOf(address(this));
        // balance1 = IERC20(_token1).balanceOf(address(this));
        // }
        // uint amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        // uint amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        // require(amount0In > 0 || amount1In > 0, 'UniswapV2: INSUFFICIENT_INPUT_AMOUNT');
        // { // scope for reserve{0,1}Adjusted, avoids stack too deep errors
        // uint balance0Adjusted = balance0.mul(1000).sub(amount0In.mul(3));
        // uint balance1Adjusted = balance1.mul(1000).sub(amount1In.mul(3));
        // require(balance0Adjusted.mul(balance1Adjusted) >= uint(_reserve0).mul(_reserve1).mul(1000**2), 'UniswapV2: K');
        // }

        // _update(balance0, balance1, _reserve0, _reserve1);
        // emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }



    /// @notice swapExactInputSingle swaps a fixed amount of DAI for a maximum possible amount of WETH9
    /// using the DAI/WETH9 0.3% pool by calling `exactInputSingle` in the swap router.
    /// @dev The calling address must approve this contract to spend at least `amountIn` worth of its DAI for this function to succeed.
    /// @param amountIn The exact amount of DAI that will be swapped for WETH9.
    /// @return amountOut The amount of WETH9 received.
    function swapExactInputSingle(uint256 amountIn) external returns (uint256 amountOut) {
        // msg.sender must approve this contract

        // Transfer the specified amount of DAI to this contract.
        TransferHelper.safeTransferFrom(DAI, msg.sender, address(this), amountIn);

        // Approve the router to spend DAI.
        TransferHelper.safeApprove(DAI, address(swapRouter), amountIn);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: DAI,
                tokenOut: WETH9,
                fee: poolFee,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // The call to `exactInputSingle` executes the swap.
        amountOut = swapRouter.exactInputSingle(params);
    }

    /// @notice swapExactOutputSingle swaps a minimum possible amount of DAI for a fixed amount of WETH.
    /// @dev The calling address must approve this contract to spend its DAI for this function to succeed. As the amount of input DAI is variable,
    /// the calling address will need to approve for a slightly higher amount, anticipating some variance.
    /// @param amountOut The exact amount of WETH9 to receive from the swap.
    /// @param amountInMaximum The amount of DAI we are willing to spend to receive the specified amount of WETH9.
    /// @return amountIn The amount of DAI actually spent in the swap.
    function swapExactOutputSingle(uint256 amountOut, uint256 amountInMaximum) external returns (uint256 amountIn) {
        // Transfer the specified amount of DAI to this contract.
        TransferHelper.safeTransferFrom(DAI, msg.sender, address(this), amountInMaximum);

        // Approve the router to spend the specifed `amountInMaximum` of DAI.
        // In production, you should choose the maximum amount to spend based on oracles or other data sources to acheive a better swap.
        TransferHelper.safeApprove(DAI, address(swapRouter), amountInMaximum);

        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: DAI,
                tokenOut: WETH9,
                fee: poolFee,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: 0
            });

        // Executes the swap returning the amountIn needed to spend to receive the desired amountOut.
        amountIn = swapRouter.exactOutputSingle(params);

        // For exact output swaps, the amountInMaximum may not have all been spent.
        // If the actual amount spent (amountIn) is less than the specified maximum amount, we must refund the msg.sender and approve the swapRouter to spend 0.
        if (amountIn < amountInMaximum) {
            TransferHelper.safeApprove(DAI, address(swapRouter), 0);
            TransferHelper.safeTransfer(DAI, msg.sender, amountInMaximum - amountIn);
        }
    }

    /// @notice swapInputMultiplePools swaps a fixed amount of DAI for a maximum possible amount of WETH9 through an intermediary pool.
    /// For this example, we will swap DAI to USDC, then USDC to WETH9 to achieve our desired output.
    /// @dev The calling address must approve this contract to spend at least `amountIn` worth of its DAI for this function to succeed.
    /// @param amountIn The amount of DAI to be swapped.
    /// @return amountOut The amount of WETH9 received after the swap.
    function swapExactInputMultihop(uint256 amountIn) external returns (uint256 amountOut) {
        // Transfer `amountIn` of DAI to this contract.
        TransferHelper.safeTransferFrom(DAI, msg.sender, address(this), amountIn);

        // Approve the router to spend DAI.
        TransferHelper.safeApprove(DAI, address(swapRouter), amountIn);

        // Multiple pool swaps are encoded through bytes called a `path`. A path is a sequence of token addresses and poolFees that define the pools used in the swaps.
        // The format for pool encoding is (tokenIn, fee, tokenOut/tokenIn, fee, tokenOut) where tokenIn/tokenOut parameter is the shared token across the pools.
        // Since we are swapping DAI to USDC and then USDC to WETH9 the path encoding is (DAI, 0.3%, USDC, 0.3%, WETH9).
        ISwapRouter.ExactInputParams memory params =
            ISwapRouter.ExactInputParams({
                path: abi.encodePacked(DAI, poolFee, USDC, poolFee, WETH9),
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0
            });

        // Executes the swap.
        amountOut = swapRouter.exactInput(params);
    }

    /// @notice swapExactOutputMultihop swaps a minimum possible amount of DAI for a fixed amount of WETH through an intermediary pool.
    /// For this example, we want to swap DAI for WETH9 through a USDC pool but we specify the desired amountOut of WETH9. Notice how the path encoding is slightly different in for exact output swaps.
    /// @dev The calling address must approve this contract to spend its DAI for this function to succeed. As the amount of input DAI is variable,
    /// the calling address will need to approve for a slightly higher amount, anticipating some variance.
    /// @param amountOut The desired amount of WETH9.
    /// @param amountInMaximum The maximum amount of DAI willing to be swapped for the specified amountOut of WETH9.
    /// @return amountIn The amountIn of DAI actually spent to receive the desired amountOut.
    function swapExactOutputMultihop(uint256 amountOut, uint256 amountInMaximum) external returns (uint256 amountIn) {
        // Transfer the specified `amountInMaximum` to this contract.
        TransferHelper.safeTransferFrom(DAI, msg.sender, address(this), amountInMaximum);
        // Approve the router to spend  `amountInMaximum`.
        TransferHelper.safeApprove(DAI, address(swapRouter), amountInMaximum);

        // The parameter path is encoded as (tokenOut, fee, tokenIn/tokenOut, fee, tokenIn)
        // The tokenIn/tokenOut field is the shared token between the two pools used in the multiple pool swap. In this case USDC is the "shared" token.
        // For an exactOutput swap, the first swap that occurs is the swap which returns the eventual desired token.
        // In this case, our desired output token is WETH9 so that swap happpens first, and is encoded in the path accordingly.
        ISwapRouter.ExactOutputParams memory params =
            ISwapRouter.ExactOutputParams({
                path: abi.encodePacked(WETH9, poolFee, USDC, poolFee, DAI),
                recipient: msg.sender,
                deadline: block.timestamp,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum
            });

        // Executes the swap, returning the amountIn actually spent.
        amountIn = swapRouter.exactOutput(params);

        // If the swap did not require the full amountInMaximum to achieve the exact amountOut then we refund msg.sender and approve the router to spend 0.
        if (amountIn < amountInMaximum) {
            TransferHelper.safeApprove(DAI, address(swapRouter), 0);
            TransferHelper.safeTransferFrom(DAI, address(this), msg.sender, amountInMaximum - amountIn);
        }
    }
}