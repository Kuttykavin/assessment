const db = require('../config/database');

async function getRecommendedAction(exceptionType, serviceOrderId) {
  try {
    // Get historical resolutions for similar exceptions
    const [similar] = await db.query(`
      SELECT resolution_notes, COUNT(*) as frequency
      FROM exceptions
      WHERE exception_type = ? AND status = 'resolved' AND resolution_notes IS NOT NULL
      GROUP BY resolution_notes
      ORDER BY frequency DESC
      LIMIT 1
    `, [exceptionType]);

    if (similar.length > 0) {
      return `Recommended based on ${similar[0].frequency} similar cases: ${similar[0].resolution_notes}`;
    }

    // Default recommendations by exception type
    const defaultRecommendations = {
      'missing_data': 'Contact customer to provide missing information. Review master data completeness.',
      'validation_error': 'Review and correct validation errors. Ensure all mandatory fields are filled.',
      'approval_delay': 'Follow up with approver. Consider escalation if overdue by 48 hours.',
      'aging': 'Prioritize this order. Review blockers and assign resources immediately.',
      'compliance': 'Review compliance requirements. Consult with compliance officer if needed.',
      'document_issue': 'Request proper documentation from customer. Upload required documents.',
      'cost_overrun': 'Review cost justification. Obtain approval from manager before proceeding.'
    };

    return defaultRecommendations[exceptionType] || 'Review exception details and take appropriate action.';
  } catch (error) {
    console.error('Get recommendation error:', error);
    return 'Please review and resolve this exception.';
  }
}

module.exports = { getRecommendedAction };
