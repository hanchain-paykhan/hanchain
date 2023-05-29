// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenVestingLock
 * This contract allows HanChain payments to be split among a group of accounts.
 * The sender does not need to be aware that the HanChain tokens will be split in this way,
 * since it is handled transparently by the contract.
 * Additionally, this contract handles the vesting of HanChain tokens for a given payee and
 * release the tokens to the payee following a given vesting schedule.

 * The split can be in equal parts or in any other arbitrary proportion.
 * The way this is specified is by assigning each account to a number of shares.
 * Of all the HanChain tokens that this contract receives, each account will then be able
 * to claim an amount proportional to the percentage of total shares they were assigned.
 * The distribution of shares is set at the time of contract deployment and can't be updated thereafter.
 * Additionally, any token transferred to this contract will follow the vesting schedule as if they were locked from the beginning.
 * Consequently, if the vesting has already started, any amount of tokens sent to this contract will (at least partly)
 * be immediately releasable.

 * 'TokenVestingLock' follows a _pull payment_ model. This means that payments are not automatically forwarded to the
 * accounts but kept in this contract, and the actual transfer is triggered as a separate step by calling the {release} function.
*/

contract TokenVestingLock is Ownable {
    IERC20 public token;

    // Payee struct represents a participant who is eligible to receive tokens from a smart contract.
    struct Payee {
        address account;  // The address of the payee's Ethereum account
        uint256 shares;  // The corresponding list of shares (in percentage) that each payee is entitled to receive.
        uint256 tokensPerRoundPerPayee;  // The number of tokens the payee will receive per round of token distribution
        uint256 releaseTokens;  // The total number of tokens the payee is eligible to receive over the course of the contract
    }

    uint256 public durationSeconds;  // The duration of the vesting period in seconds.
    uint256 public intervalSeconds;  // The time interval between token releases in seconds.
    uint256 public totalReleaseTokens;  // The total number of tokens to be released over the vesting period.
    uint256 public totalReleasedTokens;  // The total number of tokens already released.
    uint256 public startTime;  // The timestamp when the vesting period starts.
    uint256 public totalRounds;  // The total number of token release rounds.
    uint256 public totalAccounts;  // The total number of payees.

    Payee[] public payees;  // An array of Payee structs representing the payees.
    mapping(address => uint256) public releasedAmount;  // A mapping of released token amounts for each payee address.

    /** Creates a new TokenVestingLock contract instance that locks the specified ERC20 token for a certain period of time,
     * and releases it in a linear fashion to a list of payees.
     * Set the payee, start timestamp and vesting duration of the 'TokenVestingLock' wallet.
     *
     * Creates an instance of `TokenVestingLock` where each account in `accounts` is assigned the number of shares at
     * the matching position in the `shares` array.
     * All addresses in `accounts` must be non-zero. Both arrays must have the same non-zero length, and there must be no
     * duplicates in `accounts`
     *
     * @param _startDelay The delay in seconds before vesting starts.
     * @param _accounts The list of addresses of the payees.
     */
    constructor(IERC20 _token, uint256 _startDelay, uint256 _durationSeconds, uint256 _intervalSeconds, uint256 _totalReleaseTokens, address[] memory _accounts, uint256[] memory _shares) {
        require(_accounts.length == _shares.length, "TokenVestingLock: accounts and shares length mismatch");
        require(_accounts.length > 0, "TokenVestingLock: no payees");

        uint256 totalShares = 0;
        for (uint256 i = 0; i < _shares.length; i++) {
            totalShares += _shares[i];
        }
        require(totalShares == 100, "Shares must sum up to 100");

        token = _token;
        durationSeconds = _durationSeconds;
        startTime = block.timestamp + _startDelay;
        intervalSeconds = _intervalSeconds;
        totalReleaseTokens = _totalReleaseTokens;
        totalRounds = durationSeconds/intervalSeconds;
        totalAccounts = _accounts.length;
     for (uint256 i = 0; i < _accounts.length; i++) {
            uint256 tokensPerRoundPerBeneficiary = totalReleaseTokens * intervalSeconds / durationSeconds * _shares[i] / 100;
            uint256 releaseTokens = tokensPerRoundPerBeneficiary * totalRounds;
            payees.push(Payee(_accounts[i], _shares[i], tokensPerRoundPerBeneficiary, releaseTokens));
        }

    }

    /**
     * Releases tokens to payees based on the vesting schedule.
     * Tokens are released for each time interval as defined by `intervalSeconds` until the vesting period ends.
     * Tokens that have already been released will not be released again.
     * If the vesting period has not yet started, the function will revert.
     *
     * Anyone can execute the 'release' function.
     */    
    function release() public {
        uint256 currentTime = block.timestamp;
        require(currentTime >= startTime, "Vesting not started yet");

        uint256 elapsedTime = currentTime - startTime;
        uint256 currentInterval = elapsedTime / intervalSeconds;
        uint256 nextIntervalTime = (currentInterval + 1) * intervalSeconds;

        if (nextIntervalTime <= currentTime) {
            uint256 numIntervals = (currentTime - startTime) / intervalSeconds;
            uint256 totalVestedTokens = (totalReleaseTokens * numIntervals) / (durationSeconds / intervalSeconds);
            if (totalVestedTokens > totalReleaseTokens) {
                totalVestedTokens = totalReleaseTokens;
            }
            uint256 unreleased = totalVestedTokens;
            for (uint256 i = 0; i < payees.length; i++) {
                uint256 payeeShare = (payees[i].shares * totalVestedTokens) / 100;
                uint256 releasable = payeeShare - releasedAmount[payees[i].account];

                if (unreleased > 0 && releasable > 0) {
                    uint256 tokensToRelease = (releasable < unreleased) ? releasable : unreleased;
                    releasedAmount[payees[i].account] += tokensToRelease;
                    unreleased -= tokensToRelease;
                    totalReleasedTokens += tokensToRelease;
                    token.transfer(payees[i].account, tokensToRelease);
                    emit released(payees[i].account, tokensToRelease);
                }
            }
        }
    }

    /**
     * Returns the Payee struct associated with the specified account.
     * @param _account The address of the payee account to retrieve.
     */
    function getPayee(address _account) public view returns (Payee memory) {
        for (uint256 i = 0; i < payees.length; i++) {
            if (payees[i].account == _account) {
                return payees[i];
            }
        }
        revert("missing account");
    }

    /** Returns the number of rounds released.
     * A round is considered released if the tokens for that round have been fully released.
     * If the payee has not received any tokens yet, returns 0.
     * Otherwise, calculates the number of rounds released based on the tokens already released and the tokens that the payee receives per round.
     */
    function releasedRounds() public view returns (uint256) {
        address account = payees[0].account;
        if(releasedAmount[account] == 0) {
            return 0;
        } else {
            return releasedAmount[account] / payees[0].tokensPerRoundPerPayee;
        }
    }
    
    /** Returns the number of rounds remaining until vesting is complete.
     * If the vesting has not yet started, returns the total number of rounds.
     * If vesting has already completed, returns 0.
     * Otherwise, calculates the number of rounds remaining based on the current time and the vesting duration.
     */
    function remainingRounds() public view returns (uint256) {
        if(startTime > block.timestamp) {
            return totalRounds;
        } else {
            if (block.timestamp >= startTime + durationSeconds) {
                return 0;
            } else {
                return 1 + (startTime + durationSeconds - block.timestamp) / intervalSeconds;
            }
        }
    }

    /**
     * Returns the number of tokens that are yet to be released.
     * Calculates the total number of rounds remaining based on the difference between totalRounds and the number of rounds already released,
     * and then calculates the total number of tokens remaining based on the tokensPerRound for each payee and the number of remaining rounds.
     */
    function remainingTokens() public view returns (uint256) {
        uint256 tokensPerRound = 0;
        uint256 remaining = totalRounds - releasedRounds();
        for (uint256 i = 0; i < payees.length; i++) {
            tokensPerRound += payees[i].tokensPerRoundPerPayee;
        }
        return tokensPerRound * remaining;
    }

    /** Allows the owner to recover any ERC20 tokens sent to this contract, except for the release tokens.
     * If the token being recovered is the release token, it can only be recovered if it exceeds the total release tokens.
     * Only the owner of the contract can call this function.
     */
    function recoverERC20(address _tokenAddress, uint256 _tokenAmount) external onlyOwner {
        if(address(token) == _tokenAddress) {
            uint tokenAmount = token.balanceOf(address(this)) - remainingTokens();
            require(tokenAmount >= _tokenAmount, "Total Release Tokens cannot be withdrawn");
            IERC20(_tokenAddress).transfer(msg.sender, _tokenAmount);
            emit RecoveredERC20(_tokenAddress, tokenAmount);
        } else {
            IERC20(_tokenAddress).transfer(msg.sender, _tokenAmount);
            emit RecoveredERC20(_tokenAddress, _tokenAmount);
        }
    }

    /**
     * Transfers an ERC721 token held by the contract to the owner.
     * Only the owner of the contract can call this function.
     */
    function recoverERC721(address _tokenAddress, uint256 _tokenId) external onlyOwner {
        IERC721(_tokenAddress).safeTransferFrom(address(this), msg.sender, _tokenId);
        emit RecoveredERC721(_tokenAddress, _tokenId);
    }

    event released(address indexed account, uint256 amount);
    event RecoveredERC20(address token, uint256 amount);
    event RecoveredERC721(address token, uint256 tokenId);
}