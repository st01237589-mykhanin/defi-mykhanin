// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DexPool {
    IERC20 public tokenA;
    IERC20 public tokenB;

    uint256 public reserveA;
    uint256 public reserveB;

    event Swap(address indexed trader, uint256 amountIn, uint256 amountOut);

    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external {
        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);

        reserveA += amountA;
        reserveB += amountB;
    }

    function swapAforB(uint256 amountInA) external {
        require(amountInA > 0, "Amount must be greater than zero");

        uint256 whaleThreshold = (reserveA * 5) / 100;
        uint256 feeMultiplier = amountInA > whaleThreshold ? 950 : 999;

        uint256 amountInWithFee = amountInA * feeMultiplier;
        uint256 numerator = amountInWithFee * reserveB;
        uint256 denominator = (reserveA * 1000) + amountInWithFee;

        uint256 amountOutB = numerator / denominator;
        require(amountOutB > 0, "Insufficient output");

        reserveA += amountInA;
        reserveB -= amountOutB;

        tokenA.transferFrom(msg.sender, address(this), amountInA);
        tokenB.transfer(msg.sender, amountOutB);

        emit Swap(msg.sender, amountInA, amountOutB);
    }
}