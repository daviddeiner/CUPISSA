const ScheduleEngine = {
  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },

  getNextValidQuincenalDate(startDate, index) {
    let current = new Date(startDate);
    let count = 0;
    while (count < index) {
      current.setDate(current.getDate() + 15);
      if (current.getDate() === 31) {
        current.setDate(30);
      }
      count++;
    }
    if (current.getDate() === 31) {
      current.setDate(30);
    }
    return current;
  },

  generateDates(startDateStr, frequency, count) {
    const dates = [];
    let start = new Date(startDateStr);

    for (let i = 0; i < count; i++) {
      let nextDate;
      if (frequency === 'diario') {
        nextDate = this.addDays(start, i);
      } else if (frequency === 'semanal') {
        nextDate = this.addDays(start, i * 8);
      } else if (frequency === 'quincenal') {
        nextDate = this.getNextValidQuincenalDate(start, i);
      } else if (frequency === 'mensual') {
        nextDate = new Date(start);
        nextDate.setMonth(nextDate.getMonth() + i);
        if (nextDate.getDate() === 31) {
          nextDate.setDate(30);
        }
      }
      dates.push(nextDate.toISOString().split('T')[0]);
    }
    return dates;
  },

  calculateLateFee(dueDateStr, baseAmount) {
    const today = new Date();
    const dueDate = new Date(dueDateStr);
    const diffTime = today - dueDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 0;

    const periods = Math.floor(diffDays / CONFIG.LATE_FEE_DAYS_STEP);
    return periods * (CONFIG.LATE_FEE_PERCENTAGE * baseAmount);
  }
};