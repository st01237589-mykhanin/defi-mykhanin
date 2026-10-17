// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./StableCoin.sol";

contract StableEngine is Ownable {
    StableCoin public immutable kUsd;
    AggregatorV3Interface public immutable priceFeed;

    uint256 public constant COLLATERAL_RATIO = 150;
    uint256 public constant MIN_HEALTH_FACTOR = 1e18;
    uint256 public constant LIQUIDATION_BONUS = 10;
    uint256 public constant STALE_PRICE_TIMEOUT = 3 hours;
    uint256 private constant ADDITIONAL_FEED_PRECISION = 1e10;

    mapping(address => uint256) public collateralDeposited;
    mapping(address => uint256) public kUsdMinted;

    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event StablecoinMinted(address indexed user, uint256 amount);
    event StablecoinBurned(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized);
    event CollateralReducedForTesting(address indexed user, uint256 amount);

    constructor(address _kUsdAddress, address _priceFeedAddress) Ownable(msg.sender) {
        require(AggregatorV3Interface(_priceFeedAddress).decimals() == 8, "Unsupported feed decimals");
        kUsd = StableCoin(_kUsdAddress);
        priceFeed = AggregatorV3Interface(_priceFeedAddress);
    }

    function depositCollateral() external payable {
        require(msg.value > 0, "Needs more than 0");
        collateralDeposited[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function mintStablecoin(uint256 _kUsdAmount) external {
        require(_kUsdAmount > 0, "Needs more than 0");

        kUsdMinted[msg.sender] += _kUsdAmount;
        _revertIfHealthFactorIsBroken(msg.sender);

        kUsd.mint(msg.sender, _kUsdAmount);
        emit StablecoinMinted(msg.sender, _kUsdAmount);
    }

    function burnStablecoin(uint256 amount) external {
        require(amount > 0, "Needs more than 0");
        require(amount <= kUsdMinted[msg.sender], "Burn amount exceeds debt");

        kUsdMinted[msg.sender] -= amount;
        kUsd.burn(msg.sender, amount);
        emit StablecoinBurned(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external {
        require(amount > 0, "Needs more than 0");
        require(amount <= collateralDeposited[msg.sender], "Insufficient collateral");

        collateralDeposited[msg.sender] -= amount;
        _revertIfHealthFactorIsBroken(msg.sender);

        emit CollateralWithdrawn(msg.sender, amount);
        _sendEth(msg.sender, amount);
    }

    function liquidate(address user) external {
        require(getHealthFactor(user) < MIN_HEALTH_FACTOR, "Health factor is ok");

        uint256 debtToCover = kUsdMinted[user];
        uint256 collateralToReward = (debtToCover * 1e18) / getUsdValue(1e18);
        uint256 totalCollateralToReward = collateralToReward + (collateralToReward * LIQUIDATION_BONUS) / 100;
        require(collateralDeposited[user] >= totalCollateralToReward, "Not enough collateral to liquidate");

        kUsd.burn(msg.sender, debtToCover);
        kUsdMinted[user] = 0;
        collateralDeposited[user] -= totalCollateralToReward;

        emit Liquidated(user, msg.sender, debtToCover, totalCollateralToReward);
        _sendEth(msg.sender, totalCollateralToReward);
    }

    function reduceCollateralForTesting(address user, uint256 amount) external onlyOwner {
        require(collateralDeposited[user] >= amount, "Amount exceeds balance");
        collateralDeposited[user] -= amount;
        emit CollateralReducedForTesting(user, amount);
    }

    function getHealthFactor(address user) public view returns (uint256) {
        uint256 debt = kUsdMinted[user];
        if (debt == 0) return type(uint256).max;

        uint256 collateralValueInUsd = getUsdValue(collateralDeposited[user]);
        uint256 collateralAdjustedForThreshold = (collateralValueInUsd * 100) / COLLATERAL_RATIO;

        return (collateralAdjustedForThreshold * 1e18) / debt;
    }

    function getUsdValue(uint256 ethAmount) public view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid oracle price");
        require(block.timestamp - updatedAt <= STALE_PRICE_TIMEOUT, "Stale oracle price");

        uint256 adjustedPrice = uint256(price) * ADDITIONAL_FEED_PRECISION;
        return (ethAmount * adjustedPrice) / 1e18;
    }

    function _revertIfHealthFactorIsBroken(address user) internal view {
        require(getHealthFactor(user) >= MIN_HEALTH_FACTOR, "Health factor is broken (under 1.0)");
    }

    function _sendEth(address to, uint256 amount) private {
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "ETH transfer failed");
    }
}
