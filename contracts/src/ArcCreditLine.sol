// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title ArcCreditLine
/// @notice Testnet-only, issuer-funded bilateral USDC credit facilities for Arc.
/// @dev This contract is intentionally simple for builder demonstration; it has not been audited.
contract ArcCreditLine {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_DRAW_FEE_BPS = 500; // 5.00% maximum protocol-supported facility fee.

    struct Facility {
        address issuer;
        address borrower;
        uint256 creditLimit;
        uint256 available;
        uint256 outstanding;
        uint64 maturity;
        uint16 drawFeeBps;
        bool drawsFrozen;
        bool closed;
    }

    IERC20Minimal public immutable usdc;
    uint256 public nextFacilityId = 1;
    uint256 private _locked;

    mapping(uint256 => Facility) public facility;
    mapping(address => uint256[]) private _issuedFacilities;
    mapping(address => uint256[]) private _borrowedFacilities;

    event FacilityOpened(uint256 indexed facilityId, address indexed issuer, address indexed borrower, uint256 creditLimit, uint64 maturity, uint16 drawFeeBps);
    event CreditDrawn(uint256 indexed facilityId, address indexed borrower, uint256 grossAmount, uint256 netAmount, uint256 feeAmount);
    event CreditRepaid(uint256 indexed facilityId, address indexed borrower, uint256 amount, uint256 outstandingAfter);
    event DrawsFrozen(uint256 indexed facilityId, address indexed issuer);
    event FacilityClosed(uint256 indexed facilityId, address indexed issuer, uint256 returnedCash);

    modifier nonReentrant() {
        require(_locked == 0, "Reentrancy");
        _locked = 1;
        _;
        _locked = 0;
    }

    constructor(address usdc_) {
        require(usdc_ != address(0), "Zero USDC address");
        usdc = IERC20Minimal(usdc_);
    }

    /// @notice Issuer funds a new bilateral credit facility with ERC-20 USDC.
    /// @param borrower Wallet allowed to draw and repay.
    /// @param creditLimit Amount of USDC funded into this facility, in 6-decimal units.
    /// @param maturity Unix timestamp after which no additional draws are allowed.
    /// @param drawFeeBps Fee deducted from each draw and paid directly to issuer.
    function openFacility(address borrower, uint256 creditLimit, uint64 maturity, uint16 drawFeeBps)
        external
        nonReentrant
        returns (uint256 facilityId)
    {
        require(borrower != address(0), "Zero borrower");
        require(borrower != msg.sender, "Issuer equals borrower");
        require(creditLimit > 0, "Zero limit");
        require(maturity > block.timestamp + 1 hours, "Maturity too soon");
        require(drawFeeBps <= MAX_DRAW_FEE_BPS, "Fee too high");
        require(usdc.transferFrom(msg.sender, address(this), creditLimit), "USDC funding failed");

        facilityId = nextFacilityId++;
        facility[facilityId] = Facility({
            issuer: msg.sender,
            borrower: borrower,
            creditLimit: creditLimit,
            available: creditLimit,
            outstanding: 0,
            maturity: maturity,
            drawFeeBps: drawFeeBps,
            drawsFrozen: false,
            closed: false
        });
        _issuedFacilities[msg.sender].push(facilityId);
        _borrowedFacilities[borrower].push(facilityId);

        emit FacilityOpened(facilityId, msg.sender, borrower, creditLimit, maturity, drawFeeBps);
    }

    /// @notice Borrower draws USDC from an active funded facility.
    /// @dev The fee is paid to issuer immediately; borrower receives the net amount but owes gross amount.
    function draw(uint256 facilityId, uint256 amount) external nonReentrant {
        Facility storage f = facility[facilityId];
        require(f.issuer != address(0), "Facility not found");
        require(msg.sender == f.borrower, "Borrower only");
        require(!f.closed && !f.drawsFrozen, "Draws unavailable");
        require(block.timestamp < f.maturity, "Facility matured");
        require(amount > 0 && amount <= f.available, "Invalid draw amount");

        uint256 fee = (amount * f.drawFeeBps) / BPS_DENOMINATOR;
        uint256 netAmount = amount - fee;
        f.available -= amount;
        f.outstanding += amount;

        if (fee > 0) require(usdc.transfer(f.issuer, fee), "Fee transfer failed");
        require(usdc.transfer(f.borrower, netAmount), "Borrower transfer failed");
        emit CreditDrawn(facilityId, f.borrower, amount, netAmount, fee);
    }

    /// @notice Borrower repays gross debt. Repayment reopens drawable capacity only before maturity and while draws remain unfrozen.
    function repay(uint256 facilityId, uint256 amount) external nonReentrant {
        Facility storage f = facility[facilityId];
        require(f.issuer != address(0), "Facility not found");
        require(msg.sender == f.borrower, "Borrower only");
        require(amount > 0 && amount <= f.outstanding, "Invalid repayment");
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC repayment failed");

        f.outstanding -= amount;
        f.available += amount;
        emit CreditRepaid(facilityId, f.borrower, amount, f.outstanding);
    }

    /// @notice Issuer stops new drawings but keeps repayment available.
    function freezeDraws(uint256 facilityId) external {
        Facility storage f = facility[facilityId];
        require(f.issuer == msg.sender, "Issuer only");
        require(!f.closed, "Facility closed");
        f.drawsFrozen = true;
        emit DrawsFrozen(facilityId, msg.sender);
    }

    /// @notice Issuer closes a fully repaid facility and reclaims all available USDC.
    function closeFacility(uint256 facilityId) external nonReentrant {
        Facility storage f = facility[facilityId];
        require(f.issuer == msg.sender, "Issuer only");
        require(!f.closed, "Facility closed");
        require(f.outstanding == 0, "Outstanding debt exists");

        f.closed = true;
        f.drawsFrozen = true;
        uint256 returnedCash = f.available;
        f.available = 0;
        require(usdc.transfer(f.issuer, returnedCash), "USDC close transfer failed");
        emit FacilityClosed(facilityId, msg.sender, returnedCash);
    }

    function issuedFacilities(address issuer) external view returns (uint256[] memory) {
        return _issuedFacilities[issuer];
    }

    function borrowedFacilities(address borrower) external view returns (uint256[] memory) {
        return _borrowedFacilities[borrower];
    }
}
